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
        let node = find_node()?;
        let backend_dir = &self.config.backend_dir;

        let main_js = if backend_dir.join("dist").join("src").join("main.js").exists() {
            "dist/src/main.js"
        } else {
            "dist/main.js"
        };

        let mut cmd = Command::new(&node);
        cmd.arg(main_js)
            .current_dir(backend_dir)
            .env("DATABASE_URL", self.config.database_url())
            .env("PORT", self.port.to_string())
            .env("NODE_ENV", "production")
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        append_path(&mut cmd);
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

pub fn find_node() -> Result<String, String> {
    let candidates = ["node", "nodejs"];
    for candidate in &candidates {
        if let Ok(output) = Command::new(candidate)
            .arg("--version")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
        {
            if output.status.success() {
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

    Err("Node.js not found. Please install Node.js and add it to PATH.".to_string())
}

fn node_dir() -> Option<PathBuf> {
    let node_path = find_node().ok()?;
    let path = PathBuf::from(&node_path);
    if path.is_absolute() {
        path.parent().map(|p| p.to_path_buf())
    } else {
        if let Ok(output) = Command::new(&node_path)
            .arg("--version")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
        {
            if output.status.success() {
                if let Ok(where_output) = Command::new("where")
                    .arg(&node_path)
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .output()
                {
                    let stdout = String::from_utf8_lossy(&where_output.stdout);
                    if let Some(first_line) = stdout.lines().next() {
                        let full = PathBuf::from(first_line.trim());
                        if full.exists() {
                            return full.parent().map(|p| p.to_path_buf());
                        }
                    }
                }
            }
        }
        None
    }
}

pub fn append_path(cmd: &mut Command) {
    if let Some(dir) = node_dir() {
        let current_path = std::env::var("PATH").unwrap_or_default();
        let new_path = format!("{};{}", dir.display(), current_path);
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
                            if body.get("ready").and_then(|v| v.as_bool()) == Some(true) {
                                log::debug!("Health monitor: OK (ready=true)");
                            } else {
                                warn!("Health monitor: backend responding but not ready");
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

pub fn run_npm_install(backend_dir: &std::path::Path) -> Result<(), String> {
    info!("Running npm install in backend...");
    let mut cmd = Command::new("cmd");
    cmd.args(["/c", "npm", "install", "--production=false"])
        .current_dir(backend_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    append_path(&mut cmd);
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run npm install: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("npm install failed: {}", stderr));
    }

    info!("npm install completed successfully");
    Ok(())
}

pub fn run_prisma_generate(backend_dir: &std::path::Path) -> Result<(), String> {
    info!("Running prisma generate...");
    let mut cmd = Command::new("cmd");
    cmd.args(["/c", "npx", "prisma", "generate"])
        .current_dir(backend_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    append_path(&mut cmd);
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run prisma generate: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        warn!("prisma generate warning: {}", stderr);
    } else {
        info!("Prisma client generated successfully");
    }
    Ok(())
}

pub fn run_prisma_migrate_deploy(
    backend_dir: &std::path::Path,
    database_url: &str,
) -> Result<(), String> {
    info!("Running prisma migrate deploy...");
    let mut cmd = Command::new("cmd");
    cmd.args(["/c", "npx", "prisma", "migrate", "deploy"])
        .current_dir(backend_dir)
        .env("DATABASE_URL", database_url)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    append_path(&mut cmd);
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run prisma migrate deploy: {}", e))?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);

    if !output.status.success() {
        error!("Migration failed (exit {}): {}", output.status.code().unwrap_or(-1), stderr);
        return Err(format!("Prisma migrate deploy failed: {}", stderr));
    }

    if !stderr.trim().is_empty() {
        info!("Migration output: {}", stderr.lines().last().unwrap_or(""));
    }
    if !stdout.trim().is_empty() {
        info!("Migration stdout: {}", stdout.lines().last().unwrap_or(""));
    }

    info!("Database migrations applied successfully");
    Ok(())
}

pub fn ensure_prisma_client(backend_dir: &std::path::Path) -> Result<(), String> {
    let client_dir = backend_dir.join("node_modules").join(".prisma").join("client");
    if client_dir.exists() {
        let main_js = client_dir.join("index.js");
        if main_js.exists() {
            info!("Prisma client already generated, skipping");
            return Ok(());
        }
    }

    run_prisma_generate(backend_dir)
}

pub fn build_backend(backend_dir: &std::path::Path) -> Result<(), String> {
    if backend_dir.join("dist").join("src").join("main.js").exists()
        || backend_dir.join("dist").join("main.js").exists()
    {
        info!("Backend already built, skipping build step");
        return Ok(());
    }

    info!("Building NestJS backend...");
    let mut cmd = Command::new("cmd");
    cmd.args(["/c", "npm", "run", "build"])
        .current_dir(backend_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    append_path(&mut cmd);
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run npm build: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "Backend build failed:\nstdout: {}\nstderr: {}",
            stdout, stderr
        ));
    }

    info!("NestJS backend built successfully");
    Ok(())
}
