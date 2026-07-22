use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

pub fn copy_database(src: &Path, dest_dir: &Path) -> Result<BackupResult, String> {
    fs::create_dir_all(dest_dir)
        .map_err(|e| format!("Failed to create backup directory: {}", e))?;

    let timestamp = chrono_filename();
    let backup_name = format!("jornadas_{}.db", timestamp);
    let backup_path = dest_dir.join(&backup_name);

    fs::copy(src, &backup_path)
        .map_err(|e| format!("Failed to copy database: {}", e))?;

    let checksum = file_checksum(&backup_path)?;

    let checksum_path = backup_path.with_extension("db.sha256");
    fs::write(&checksum_path, &checksum)
        .map_err(|e| format!("Failed to write checksum: {}", e))?;

    let meta_path = backup_path.with_extension("db.json");
    let meta = serde_json::json!({
        "filename": backup_name,
        "timestamp": chrono_filename(),
        "checksum": checksum,
        "size_bytes": fs::metadata(&backup_path).map(|m| m.len()).unwrap_or(0),
    });
    fs::write(&meta_path, serde_json::to_string_pretty(&meta).unwrap())
        .map_err(|e| format!("Failed to write metadata: {}", e))?;

    Ok(BackupResult {
        path: backup_path.to_string_lossy().to_string(),
        checksum,
        size_bytes: fs::metadata(&backup_path).map(|m| m.len()).unwrap_or(0),
    })
}

pub fn verify_backup_integrity(backup_path: &Path) -> Result<bool, String> {
    let checksum_path = backup_path.with_extension("db.sha256");

    if !checksum_path.exists() {
        return Ok(false);
    }

    let stored_checksum = fs::read_to_string(&checksum_path)
        .map_err(|e| format!("Failed to read checksum: {}", e))?
        .trim()
        .to_string();

    let actual_checksum = file_checksum(backup_path)?;

    Ok(stored_checksum == actual_checksum)
}

pub fn restore_database(backup_path: &Path, db_path: &Path) -> Result<(), String> {
    if !backup_path.exists() {
        return Err(format!(
            "Backup file not found: {}",
            backup_path.display()
        ));
    }

    let integrity = verify_backup_integrity(backup_path)
        .map_err(|e| format!("Integrity check failed: {}", e))?;
    if !integrity {
        return Err("Backup integrity check failed (checksum mismatch)".to_string());
    }

    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create DB directory: {}", e))?;
    }

    let temp_path = db_path.with_extension("db.restoring");
    fs::copy(backup_path, &temp_path)
        .map_err(|e| format!("Failed to copy backup to DB location: {}", e))?;

    fs::rename(&temp_path, db_path)
        .map_err(|e| format!("Failed to move restored database into place: {}", e))?;

    Ok(())
}

pub fn file_checksum(path: &Path) -> Result<String, String> {
    let data = fs::read(path).map_err(|e| format!("Failed to read file for checksum: {}", e))?;
    let mut hasher = Sha256::new();
    hasher.update(&data);
    let result = hasher.finalize();
    Ok(format!("{:x}", result))
}

fn chrono_filename() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let days = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    let mut y = 1970u32;
    let mut remaining = days;
    loop {
        let days_in_year = if is_leap(y) { 366 } else { 365 };
        if remaining < days_in_year as u64 {
            break;
        }
        remaining -= days_in_year as u64;
        y += 1;
    }

    let leap = is_leap(y);
    let month_days = [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut m = 1u32;
    let mut rem = remaining;
    for &md in &month_days {
        if rem < md as u64 {
            break;
        }
        rem -= md as u64;
        m += 1;
    }
    let d = rem as u32 + 1;

    format!(
        "{:04}{:02}{:02}_{:02}{:02}{:02}",
        y, m, d, hours, minutes, seconds
    )
}

fn is_leap(y: u32) -> bool {
    (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0)
}

#[derive(Debug, serde::Serialize)]
pub struct BackupResult {
    pub path: String,
    pub checksum: String,
    pub size_bytes: u64,
}
