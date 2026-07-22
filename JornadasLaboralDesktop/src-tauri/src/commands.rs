use std::path::Path;
use std::process::Command;

use crate::backup;
use crate::config::AppConfig;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub fn get_system_info(config: tauri::State<AppConfig>) -> SystemInfo {
    SystemInfo {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        profile: format!("{:?}", config.profile),
        port: config.port,
        app_data_dir: config.app_data_dir.to_string_lossy().to_string(),
        db_path: config.db_path.to_string_lossy().to_string(),
        backend_dir: config.backend_dir.to_string_lossy().to_string(),
        db_exists: config.db_path.exists(),
        db_size_bytes: std::fs::metadata(&config.db_path)
            .map(|m| m.len())
            .unwrap_or(0),
        backup_count: count_backups(&config.backup_dir),
    }
}

#[tauri::command]
pub fn create_backup(
    config: tauri::State<AppConfig>,
) -> Result<backup::BackupResult, String> {
    backup::copy_database(&config.db_path, &config.backup_dir)
}

#[tauri::command]
pub fn open_in_explorer(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let canonical = p.canonicalize().map_err(|e| format!("Cannot resolve path: {}", e))?;
    let path_str = canonical.to_string_lossy().to_string();

    if path_str.contains("..") {
        return Err("Path traversal not allowed".to_string());
    }

    if p.is_file() {
        Command::new("explorer")
            .arg(format!("/select,{}", path_str))
            .spawn()
            .map_err(|e| format!("Failed to open explorer: {}", e))?;
    } else {
        Command::new("explorer")
            .arg(&path_str)
            .spawn()
            .map_err(|e| format!("Failed to open explorer: {}", e))?;
    }

    Ok(())
}

#[derive(Debug, serde::Serialize)]
pub struct SystemInfo {
    pub app_version: String,
    pub profile: String,
    pub port: u16,
    pub app_data_dir: String,
    pub db_path: String,
    pub backend_dir: String,
    pub db_exists: bool,
    pub db_size_bytes: u64,
    pub backup_count: usize,
}

fn count_backups(backup_dir: &Path) -> usize {
    std::fs::read_dir(backup_dir)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.path()
                        .extension()
                        .map(|ext| ext == "db")
                        .unwrap_or(false)
                })
                .count()
        })
        .unwrap_or(0)
}

#[tauri::command]
pub async fn open_file_dialog(app: AppHandle, filters: Option<Vec<FileFilter>>) -> Result<Option<String>, String> {
    let result = {
        let mut builder = app.dialog().file();

        if let Some(filters) = filters {
            for f in &filters {
                let exts: Vec<&str> = f.extensions.iter().map(|s| s.as_str()).collect();
                builder = builder.add_filter(&f.name, &exts);
            }
        }

        builder
            .blocking_pick_file()
            .map(|p| p.to_string())
    };

    Ok(result)
}

#[tauri::command]
pub async fn save_file_dialog(app: AppHandle, default_name: Option<String>, filters: Option<Vec<FileFilter>>) -> Result<Option<String>, String> {
    let result = {
        let mut builder = app.dialog().file();

        if let Some(name) = &default_name {
            builder = builder.set_file_name(name);
        }

        if let Some(filters) = filters {
            for f in &filters {
                let exts: Vec<&str> = f.extensions.iter().map(|s| s.as_str()).collect();
                builder = builder.add_filter(&f.name, &exts);
            }
        }

        builder
            .blocking_save_file()
            .map(|p| p.to_string())
    };

    Ok(result)
}

#[tauri::command]
pub async fn open_directory_dialog(app: AppHandle) -> Result<Option<String>, String> {
    let result = app
        .dialog()
        .file()
        .blocking_pick_folder()
        .map(|p| p.to_string());

    Ok(result)
}

#[derive(Debug, serde::Deserialize)]
pub struct FileFilter {
    pub name: String,
    pub extensions: Vec<String>,
}
