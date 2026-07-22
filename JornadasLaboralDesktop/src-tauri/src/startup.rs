use log::{info, warn};
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use crate::backup;
use crate::config::AppConfig;
use crate::sidecar;

pub struct StartupResult {
    pub config: AppConfig,
    pub sidecar_handle: Arc<sidecar::SidecarManager>,
    pub health_handle: Option<std::thread::JoinHandle<()>>,
}

pub fn run_startup(_app_handle: tauri::AppHandle) -> Result<StartupResult, String> {
    info!("=== Application Startup ===");

    info!("[1/8] Initializing configuration...");
    let config = AppConfig::initialize()?;
    info!(
        "  Profile: {:?}, Port: {}, AppData: {}",
        config.profile,
        config.port,
        config.app_data_dir.display()
    );

    info!("[2/8] Initializing logging...");
    initialize_logging(&config)?;

    info!("[3/8] Creating startup backup...");
    create_startup_backup(&config)?;

    info!("[4/8] Verifying and seeding database...");
    verify_and_seed_database(&config)?;

    info!("[5/8] Ensuring Prisma client is generated...");
    sidecar::ensure_prisma_client(&config.backend_dir)?;

    info!("[6/8] Running Prisma migrations...");
    sidecar::run_prisma_migrate_deploy(&config.backend_dir, &config.database_url())?;

    info!("[7/8] Starting NestJS sidecar...");
    let sidecar = Arc::new(sidecar::SidecarManager::new(config.clone()));
    sidecar.start()?;

    info!("[8/8] Starting background health monitor...");
    let running = Arc::new(AtomicBool::new(true));
    let health_url = config.health_url();
    let sidecar_clone = sidecar.clone();
    let health_handle = Some(sidecar::start_background_health_monitor(
        health_url,
        running,
        Box::new(move || sidecar_clone.restart()),
    ));

    info!("=== Application Startup Complete ===");

    Ok(StartupResult {
        config,
        sidecar_handle: sidecar,
        health_handle,
    })
}

pub fn run_shutdown(sidecar: &sidecar::SidecarManager) {
    info!("=== Application Shutdown ===");

    info!("[1/3] Stopping sidecar health monitor...");
    info!("[2/3] Stopping NestJS sidecar...");
    sidecar.stop();

    info!("[3/3] Flushing logs...");
    log::logger().flush();

    info!("=== Application Shutdown Complete ===");
}

fn initialize_logging(config: &AppConfig) -> Result<(), String> {
    let log_file = config.logs_dir.join("app.log");
    let log_level = std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string());

    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or(&log_level))
        .target(env_logger::Target::Pipe(Box::new(
            std::fs::File::create(&log_file)
                .map_err(|e| format!("Failed to create log file: {}", e))?,
        )))
        .format_timestamp_millis()
        .init();

    Ok(())
}

fn create_startup_backup(config: &AppConfig) -> Result<(), String> {
    if config.db_path.exists() {
        let meta = std::fs::metadata(&config.db_path)
            .map_err(|e| format!("Cannot read database file: {}", e))?;
        if meta.len() < 16 {
            info!("  Database file is empty, skipping backup");
            return Ok(());
        }
        match backup::copy_database(&config.db_path, &config.backup_dir) {
            Ok(result) => {
                info!(
                    "  Backup created: {} ({} bytes)",
                    result.path, result.size_bytes
                );
            }
            Err(e) => {
                warn!("  Could not create startup backup: {}", e);
            }
        }
    } else {
        info!("  No existing database, skipping backup");
    }
    Ok(())
}

fn verify_and_seed_database(config: &AppConfig) -> Result<(), String> {
    if let Some(parent) = config.db_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create DB directory: {}", e))?;
    }

    if config.db_path.exists() {
        let meta = std::fs::metadata(&config.db_path)
            .map_err(|e| format!("Cannot read database file: {}", e))?;

        if meta.len() < 16 {
            warn!(
                "  Database file is empty ({} bytes), removing and re-seeding",
                meta.len()
            );
            std::fs::remove_file(&config.db_path).ok();
            seed_database_from_template(config)?;
        } else {
            info!(
                "  Database exists: {} ({} bytes)",
                config.db_path.display(),
                meta.len()
            );
            check_sqlite_integrity(&config.db_path)?;
        }
    } else {
        info!("  Database not found, seeding from template...");
        seed_database_from_template(config)?;
    }

    Ok(())
}

fn seed_database_from_template(config: &AppConfig) -> Result<(), String> {
    let template_candidates = [
        config.backend_dir.join("prisma").join("dev.db"),
        config.backend_dir.join("dev.db"),
    ];

    for template in &template_candidates {
        if template.exists() {
            let meta = std::fs::metadata(template)
                .map_err(|e| format!("Cannot read template database: {}", e))?;
            if meta.len() < 16 {
                warn!(
                    "  Template database {} is empty ({} bytes), skipping",
                    template.display(),
                    meta.len()
                );
                continue;
            }

            info!(
                "  Seeding database from {} ({} bytes)",
                template.display(),
                meta.len()
            );
            std::fs::copy(template, &config.db_path)
                .map_err(|e| format!("Failed to copy template database: {}", e))?;

            check_sqlite_integrity(&config.db_path)?;
            return Ok(());
        }
    }

    info!("  No template database found, database will be created by Prisma");
    Ok(())
}

fn check_sqlite_integrity(db_path: &Path) -> Result<(), String> {
    let header = std::fs::read(db_path)
        .map_err(|e| format!("Cannot read database: {}", e))?;
    if header.len() < 16 {
        return Err("Database file is too small to be valid".to_string());
    }
    if &header[..16] != b"SQLite format 3\0" {
        return Err("Database file is not a valid SQLite database".to_string());
    }
    info!("  Database integrity check: OK (valid SQLite header)");
    Ok(())
}
