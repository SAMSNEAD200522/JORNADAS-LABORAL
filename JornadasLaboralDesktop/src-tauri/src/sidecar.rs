use log::{error, info, warn};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::config::AppConfig;

const HEALTH_POLL_INTERVAL_MS: u64 = 1000;
const TCP_CONNECT_TIMEOUT_MS: u64 = 2000;
const HTTP_TIMEOUT_SECS: u64 = 5;
const MAX_RESTART_ATTEMPTS: u16 = 5;
const RESTART_BACKOFF_MS: u64 = 3000;
const STAGE_TCP_TIMEOUT_SECS: u64 = 15;
const STAGE_HTTP_TIMEOUT_SECS: u64 = 30;
const STAGE_READY_TIMEOUT_SECS: u64 = 60;

#[derive(Debug, Clone)]
pub enum HealthStatus {
    Starting,
    TcpListening,
    HttpResponding,
    HealthEndpointUp,
    PrismaReady,
    ApplicationReady,
    Unhealthy,
}

impl HealthStatus {
    pub fn is_ready(&self) -> bool {
        matches!(self, HealthStatus::ApplicationReady)
    }
}

pub struct SidecarManager {
    config: AppConfig,
    child: Arc<Mutex<Option<Child>>>,
    running: Arc<AtomicBool>,
    restart_count: Arc<AtomicU16>,
    port: u16,
}

impl SidecarManager {
    pub fn new(config: AppConfig) -> Self {
        let port = config.port;
        Self {
            config,
            child: Arc::new(Mutex::new(None)),
            running: Arc::new(AtomicBool::new(false)),
            restart_count: Arc::new(AtomicU16::new(0)),
            port,
        }
    }

    pub fn start(&self) -> Result<(), String> {
        info!("Starting NestJS sidecar on port {}", self.port);

        self.spawn_process()?;
        self.running.store(true, Ordering::SeqCst);
        self.staged_health_verification()?;
        self.reset_restart_counter();
        info!("NestJS sidecar is healthy and ready");
        Ok(())
    }

    pub fn stop(&self) {
        info!("Stopping NestJS sidecar...");
        self.running.store(false, Ordering::SeqCst);

        let mut child_guard = self.child.lock().unwrap();
        if let Some(ref mut child) = *child_guard {
            info!("Sending termination signal to NestJS (PID: {})", child.id());
            let _ = child.kill();
            match child.wait() {
                Ok(status) => info!("NestJS exited with status: {}", status),
                Err(e) => warn!("Error waiting for NestJS to exit: {}", e),
            }
        }
        *child_guard = None;
        info!("NestJS sidecar stopped");
    }

    pub fn restart(&self) -> Result<(), String> {
        let count = self.restart_count.load(Ordering::SeqCst);
        if count >= MAX_RESTART_ATTEMPTS {
            let msg = format!(
                "NestJS has crashed {} times. Giving up.",
                MAX_RESTART_ATTEMPTS
            );
            error!("{}", msg);
            return Err(msg);
        }

        self.restart_count.fetch_add(1, Ordering::SeqCst);
        warn!(
            "Restarting NestJS sidecar (attempt {}/{})",
            count + 1,
            MAX_RESTART_ATTEMPTS
        );

        self.stop();
        std::thread::sleep(Duration::from_millis(RESTART_BACKOFF_MS));
        self.start()
    }

    pub fn reset_restart_counter(&self) {
        self.restart_count.store(0, Ordering::SeqCst);
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    pub fn check_health(&self) -> Result<HealthStatus, String> {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let health_url = self.health_url();

        let resp = client
            .get(&health_url)
            .send()
            .map_err(|e| format!("Health check request failed: {}", e))?;

        let status = resp.status();
        if !status.is_success() {
            return Ok(HealthStatus::Unhealthy);
        }

        let body: serde_json::Value = resp
            .json()
            .map_err(|e| format!("Failed to parse health response: {}", e))?;

        if body.get("ready").and_then(|v| v.as_bool()) == Some(true) {
            Ok(HealthStatus::ApplicationReady)
        } else if body.get("estado")
            .and_then(|v| v.as_str())
            .map(|s| s == "OK")
            .unwrap_or(false)
        {
            Ok(HealthStatus::ApplicationReady)
        } else if body.get("status")
            .and_then(|v| v.as_str())
            .map(|s| s == "UP")
            .unwrap_or(false)
        {
            Ok(HealthStatus::ApplicationReady)
        } else if body.get("prisma")
            .and_then(|v| v.as_str())
            .map(|s| s == "UP")
            .unwrap_or(false)
        {
            Ok(HealthStatus::PrismaReady)
        } else if body.get("status")
            .and_then(|v| v.as_str())
            .is_some()
            || body.get("estado")
            .and_then(|v| v.as_str())
            .is_some()
        {
            Ok(HealthStatus::HealthEndpointUp)
        } else {
            Ok(HealthStatus::HttpResponding)
        }
    }

    fn staged_health_verification(&self) -> Result<(), String> {
        info!("Starting staged health verification...");

        let tcp_addr = format!("127.0.0.1:{}", self.port);

        info!("[Stage 1] Waiting for TCP port {} to listen...", self.port);
        let start = Instant::now();
        loop {
            if start.elapsed() > Duration::from_secs(STAGE_TCP_TIMEOUT_SECS) {
                return Err(format!(
                    "TCP port {} not listening within {}s",
                    self.port, STAGE_TCP_TIMEOUT_SECS
                ));
            }
            if !self.is_process_alive() {
                return Err("NestJS process died during startup".to_string());
            }
            match std::net::TcpStream::connect_timeout(
                &tcp_addr.parse().map_err(|e| format!("Invalid addr: {}", e))?,
                Duration::from_millis(TCP_CONNECT_TIMEOUT_MS),
            ) {
                Ok(_) => {
                    info!("[Stage 1] TCP port {} is listening", self.port);
                    break;
                }
                Err(_) => {
                    std::thread::sleep(Duration::from_millis(HEALTH_POLL_INTERVAL_MS));
                }
            }
        }

        info!("[Stage 2] Waiting for HTTP server to respond...");
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let start = Instant::now();
        loop {
            if start.elapsed() > Duration::from_secs(STAGE_HTTP_TIMEOUT_SECS) {
                return Err(format!(
                    "HTTP server did not respond within {}s",
                    STAGE_HTTP_TIMEOUT_SECS
                ));
            }
            if !self.is_process_alive() {
                return Err("NestJS process died during startup".to_string());
            }
            match client.get(&self.health_url_base()).send() {
                Ok(_) => {
                    info!("[Stage 2] HTTP server is responding");
                    break;
                }
                Err(_) => {
                    std::thread::sleep(Duration::from_millis(HEALTH_POLL_INTERVAL_MS));
                }
            }
        }

        info!("[Stage 3] Waiting for /health endpoint and application readiness...");
        let start = Instant::now();
        loop {
            if start.elapsed() > Duration::from_secs(STAGE_READY_TIMEOUT_SECS) {
                return Err(format!(
                    "Application did not become ready within {}s",
                    STAGE_READY_TIMEOUT_SECS
                ));
            }
            if !self.is_process_alive() {
                return Err("NestJS process died during startup".to_string());
            }

            match self.check_health() {
                Ok(status) if status.is_ready() => {
                    info!("[Stage 3] Application is ready");
                    return Ok(());
                }
                Ok(HealthStatus::ApplicationReady) => {
                    info!("[Stage 3] Application is ready");
                    return Ok(());
                }
                Ok(status) => {
                    log::debug!("[Stage 3] Status: {:?}, waiting...", status);
                    std::thread::sleep(Duration::from_millis(HEALTH_POLL_INTERVAL_MS));
                }
                Err(e) => {
                    log::debug!("[Stage 3] Health check error: {}, waiting...", e);
                    std::thread::sleep(Duration::from_millis(HEALTH_POLL_INTERVAL_MS));
                }
            }
        }
    }

    fn spawn_process(&self) -> Result<(), String> {
        let node = find_node(&self.config)?;
        let backend_dir = &self.config.backend_dir;

        let main_js_path = if backend_dir.join("dist").join("src").join("main.js").exists() {
            backend_dir.join("dist").join("src").join("main.js")
        } else {
            backend_dir.join("dist").join("main.js")
        };

        let mut cmd = Command::new(&node);
        cmd.arg(&main_js_path)
            .current_dir(&self.config.app_data_dir)
            .env("DATABASE_URL", self.config.database_url())
            .env("APP_PORT", self.port.to_string())
            .env("PORT", self.port.to_string())
            .env("NODE_ENV", "production")
            .env("FRONTEND_DIR", self.config.frontend_dir.to_string_lossy().to_string())
            .env("JWT_SECRET", "jornadas-laborales-production-2024-secure-key")
            .env("JWT_EXPIRES_IN", "8h")
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        build_path_env(&mut cmd, &self.config.node_dir, &self.config.backend_dir);

        if let Ok(f) = std::fs::File::create(self.config.logs_dir.join("backend.log")) {
            cmd.stderr(Stdio::from(f));
        }

        info!("Spawning command: {} {}", node, main_js_path.display());
        info!("  working_dir: {}", self.config.app_data_dir.display());
        info!("  APP_PORT: {}", self.port);

        let child = cmd
            .spawn()
            .map_err(|e| format!("Failed to start NestJS: {}", e))?;

        info!("NestJS process spawned (PID: {})", child.id());
        *self.child.lock().unwrap() = Some(child);
        Ok(())
    }

    fn is_process_alive(&self) -> bool {
        let mut child_guard = self.child.lock().unwrap();
        if let Some(ref mut child) = *child_guard {
            matches!(child.try_wait(), Ok(None))
        } else {
            false
        }
    }

    fn health_url(&self) -> String {
        self.config.health_url()
    }

    fn health_url_base(&self) -> String {
        self.config.backend_url()
    }
}

pub fn find_node(config: &AppConfig) -> Result<String, String> {
    if !config.node_dir.as_os_str().is_empty() {
        let bundled = config.node_dir.join("node.exe");
        if bundled.exists() {
            info!("Using bundled Node.js at {}", bundled.display());
            return Ok(bundled.to_string_lossy().to_string());
        }
    }

    let backend_node = config.backend_dir.join("node.exe");
    if backend_node.exists() {
        info!("Found Node.js at backend dir: {}", backend_node.display());
        return Ok(backend_node.to_string_lossy().to_string());
    }

    let candidates = ["node", "nodejs"];
    for candidate in &candidates {
        if let Ok(output) = Command::new(candidate)
            .arg("--version")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
        {
            if output.status.success() {
                info!("Found system Node.js: {}", candidate);
                return Ok(candidate.to_string());
            }
        }
    }

    if let Ok(path) = std::env::var("PATH") {
        for dir in path.split(';') {
            for candidate in &["node.exe", "node"] {
                let full_path = PathBuf::from(dir).join(candidate);
                if full_path.exists() {
                    return Ok(full_path.to_string_lossy().to_string());
                }
            }
        }
    }

    Err("Node.js not found. The application requires Node.js to run.".to_string())
}

fn build_path_env(cmd: &mut Command, node_dir: &std::path::Path, backend_dir: &std::path::Path) {
    let mut path_parts: Vec<String> = Vec::new();

    if !node_dir.as_os_str().is_empty() && node_dir.join("node.exe").exists() {
        path_parts.push(node_dir.to_string_lossy().to_string());
    }

    if backend_dir.join("node.exe").exists() {
        path_parts.push(backend_dir.to_string_lossy().to_string());
    }

    let current_path = std::env::var("PATH").unwrap_or_default();
    if !path_parts.is_empty() {
        let new_path = format!("{};{}", path_parts.join(";"), current_path);
        cmd.env("PATH", &new_path);
    }
}

pub fn start_background_health_monitor(
    health_url: String,
    running: Arc<AtomicBool>,
    restart_fn: Box<dyn Fn() -> Result<(), String> + Send + Sync>,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        info!("Health monitor started");

        let client = match reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
            .build()
        {
            Ok(c) => c,
            Err(e) => {
                error!("Failed to create health monitor HTTP client: {}", e);
                return;
            }
        };

        while running.load(Ordering::SeqCst) {
            std::thread::sleep(Duration::from_secs(5));

            if !running.load(Ordering::SeqCst) {
                break;
            }

            match client.get(&health_url).send() {
                Ok(resp) => {
                    if resp.status().is_success() {
                        if let Ok(body) = resp.json::<serde_json::Value>() {
                            let is_ready = body.get("ready").and_then(|v| v.as_bool()) == Some(true)
                                || body.get("estado").and_then(|v| v.as_str()) == Some("OK")
                                || body.get("status").and_then(|v| v.as_str()) == Some("UP");
                            if is_ready {
                                log::debug!("Health monitor: OK");
                            } else {
                                log::debug!("Health monitor: responding but status unknown");
                            }
                        }
                    } else {
                        warn!("Health monitor: HTTP {}", resp.status());
                    }
                }
                Err(_) => {
                    warn!("Health monitor: connection failed, attempting restart...");
                    if let Err(e) = restart_fn() {
                        error!("Restart failed: {}", e);
                    }
                }
            }
        }
        info!("Health monitor stopped");
    })
}

pub fn kill_stale_backend_processes() {
    use std::process::Command;

    let output = Command::new("wmic")
        .args([
            "process",
            "where",
            "name='node.exe'",
            "get",
            "ProcessId,CommandLine",
            "/format:csv",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    let output = match output {
        Ok(o) => o,
        Err(_) => return,
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let current_pid = std::process::id();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split(',').collect();
        if parts.len() < 3 {
            continue;
        }
        let pid_str = parts[1].trim();
        let cmd = parts[2].trim().to_lowercase();

        let is_backend = cmd.contains("dist/src/main.js")
            || cmd.contains("dist\\src\\main.js")
            || cmd.contains("dist/main.js")
            || cmd.contains("dist\\main.js");

        if !is_backend {
            continue;
        }

        if let Ok(pid) = pid_str.parse::<u32>() {
            if pid == current_pid {
                continue;
            }
            warn!(
                "Killing stale backend node process PID={} cmd={}",
                pid,
                parts[2].trim()
            );
            let _ = Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string()])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .output();
        }
    }

    std::thread::sleep(Duration::from_millis(500));
}

pub fn run_prisma_migrate_status(
    backend_dir: &std::path::Path,
    database_url: &str,
) -> Result<String, String> {
    let mut cmd = Command::new("cmd");
    cmd.args(["/c", "npx", "prisma", "migrate", "status"])
        .current_dir(backend_dir)
        .env("DATABASE_URL", database_url)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run prisma migrate status: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    Ok(format!("{}\n{}", stdout, stderr))
}

pub fn check_health_raw(url: &str) -> Result<serde_json::Value, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let resp = client
        .get(url)
        .send()
        .map_err(|e| format!("Health request failed: {}", e))?;

    resp.json::<serde_json::Value>()
        .map_err(|e| format!("Failed to parse health response: {}", e))
}
