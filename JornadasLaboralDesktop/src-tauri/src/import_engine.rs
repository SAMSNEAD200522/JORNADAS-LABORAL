use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::backup;
use crate::config::AppConfig;

#[derive(Debug, serde::Serialize)]
pub struct ImportPreview {
    pub total_rows: usize,
    pub valid_rows: usize,
    pub warning_rows: usize,
    pub error_rows: usize,
    pub errors: Vec<ImportError>,
    pub warnings: Vec<ImportWarning>,
    pub rows: Vec<ImportRow>,
}

#[derive(Debug, serde::Serialize)]
pub struct ImportError {
    pub row: usize,
    pub column: String,
    pub message: String,
}

#[derive(Debug, serde::Serialize)]
pub struct ImportWarning {
    pub row: usize,
    pub column: String,
    pub message: String,
}

#[derive(Debug, serde::Serialize)]
pub struct ImportRow {
    pub row_number: usize,
    pub document_number: String,
    pub full_name: String,
    pub status: String,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct ImportResult {
    pub success: bool,
    pub imported: usize,
    pub updated: usize,
    pub errors: usize,
    pub backup_path: Option<String>,
    pub import_id: Option<i32>,
    pub duration_ms: u64,
    pub error_report_path: Option<String>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct ImportHistoryEntry {
    pub id: i32,
    pub date: String,
    pub user: String,
    pub filename: String,
    pub duration_ms: u64,
    pub total_rows: usize,
    pub inserted: usize,
    pub updated: usize,
    pub errors: usize,
    pub status: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct ImportConfig {
    pub module: String,
    pub auto_create_references: bool,
    pub update_existing: bool,
    pub dry_run: bool,
}

#[tauri::command]
pub async fn preview_import(
    config: tauri::State<'_, AppConfig>,
    file_path: String,
    module: String,
) -> Result<ImportPreview, String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let rows = match ext.as_str() {
        "xlsx" | "xls" => read_excel_file(&path)?,
        "csv" => read_csv_file(&path)?,
        "ods" => read_excel_file(&path)?,
        _ => return Err(format!("Unsupported file format: {}", ext)),
    };

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut import_rows = Vec::new();
    let mut valid_count = 0;
    let mut warning_count = 0;
    let mut error_count = 0;

    for (idx, row) in rows.iter().enumerate() {
        let row_num = idx + 2;
        let mut row_errors = Vec::new();
        let mut row_warnings = Vec::new();

        let doc_number = row.get("document_number").cloned().unwrap_or_default();
        let full_name = row.get("full_name").cloned().unwrap_or_default();

        if module == "employees" {
            if doc_number.is_empty() {
                row_errors.push("Número de documento requerido".to_string());
                errors.push(ImportError {
                    row: row_num,
                    column: "CEDULA EMPLEADO".to_string(),
                    message: "Campo requerido".to_string(),
                });
            }

            if full_name.is_empty() {
                row_errors.push("Nombre completo requerido".to_string());
                errors.push(ImportError {
                    row: row_num,
                    column: "APELLIDOS Y NOMBRES COMPLETOS".to_string(),
                    message: "Campo requerido".to_string(),
                });
            }

            let position = row.get("position").cloned().unwrap_or_default();
            if position.is_empty() {
                row_warnings.push("Cargo no especificado".to_string());
                warnings.push(ImportWarning {
                    row: row_num,
                    column: "CARGO".to_string(),
                    message: "Se asignará el cargo por defecto".to_string(),
                });
            }
        }

        if row_errors.is_empty() {
            valid_count += 1;
        } else {
            error_count += 1;
        }

        if !row_warnings.is_empty() {
            warning_count += 1;
        }

        import_rows.push(ImportRow {
            row_number: row_num,
            document_number: doc_number,
            full_name,
            status: if row_errors.is_empty() { "valid".to_string() } else { "error".to_string() },
            errors: row_errors,
            warnings: row_warnings,
        });
    }

    Ok(ImportPreview {
        total_rows: rows.len(),
        valid_rows: valid_count,
        warning_rows: warning_count,
        error_rows: error_count,
        errors,
        warnings,
        rows: import_rows,
    })
}

#[tauri::command]
pub async fn import_file(
    config: tauri::State<'_, AppConfig>,
    app: tauri::AppHandle,
    file_path: String,
    import_config: ImportConfig,
) -> Result<ImportResult, String> {
    let start = SystemTime::now();

    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    let filename = path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let backup_result = backup::copy_database(&config.db_path, &config.backup_dir)?;

    let preview = preview_import(config.clone(), file_path.clone(), import_config.module.clone()).await?;

    if preview.error_rows > 0 && !import_config.dry_run {
        let error_report_path = generate_error_report(&config, &filename, &preview)?;
        let elapsed = start.elapsed().unwrap_or_default().as_millis() as u64;

        return Ok(ImportResult {
            success: false,
            imported: 0,
            updated: 0,
            errors: preview.error_rows,
            backup_path: Some(backup_result.path),
            import_id: None,
            duration_ms: elapsed,
            error_report_path: Some(error_report_path),
        });
    }

    let api_url = format!("http://localhost:{}/api/v1/import", config.port);

    let payload = serde_json::json!({
        "module": import_config.module,
        "filePath": file_path,
        "autoCreateReferences": import_config.auto_create_references,
        "updateExisting": import_config.update_existing,
        "dryRun": import_config.dry_run,
    });

    let client = reqwest::Client::new();
    let response = client
        .post(&api_url)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to call import API: {}", e))?;

    let status = response.status();
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse import response: {}", e))?;

    let elapsed = start.elapsed().unwrap_or_default().as_millis() as u64;

    if !status.is_success() {
        let msg = body
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("Import failed");
        return Err(msg.to_string());
    }

    Ok(ImportResult {
        success: true,
        imported: body.get("inserted").and_then(|v| v.as_u64()).unwrap_or(0) as usize,
        updated: body.get("updated").and_then(|v| v.as_u64()).unwrap_or(0) as usize,
        errors: body.get("errors").and_then(|v| v.as_u64()).unwrap_or(0) as usize,
        backup_path: Some(backup_result.path),
        import_id: body.get("importId").and_then(|v| v.as_i64()).map(|v| v as i32),
        duration_ms: elapsed,
        error_report_path: None,
    })
}

#[tauri::command]
pub async fn get_import_history(
    config: tauri::State<'_, AppConfig>,
) -> Result<Vec<ImportHistoryEntry>, String> {
    let api_url = format!(
        "http://localhost:{}/api/v1/import/history",
        config.port
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&api_url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch import history: {}", e))?;

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse history response: {}", e))?;

    let entries = body
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|item| serde_json::from_value(item.clone()).ok())
                .collect()
        })
        .unwrap_or_default();

    Ok(entries)
}

#[tauri::command]
pub async fn download_error_report(
    config: tauri::State<'_, AppConfig>,
    import_id: i32,
) -> Result<Option<String>, String> {
    let report_dir = config.export_dir.join("error_reports");
    fs::create_dir_all(&report_dir)
        .map_err(|e| format!("Failed to create report directory: {}", e))?;

    let api_url = format!(
        "http://localhost:{}/api/v1/import/{}/error-report",
        config.port, import_id
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&api_url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch error report: {}", e))?;

    if !response.status().is_success() {
        return Err("Error report not found".to_string());
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse error report: {}", e))?;

    let report_name = format!("error_report_{}.json", import_id);
    let report_path = report_dir.join(&report_name);

    fs::write(&report_path, serde_json::to_string_pretty(&body).unwrap_or_default())
        .map_err(|e| format!("Failed to write error report: {}", e))?;

    Ok(Some(report_path.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn rollback_import(
    config: tauri::State<'_, AppConfig>,
    backup_file: String,
) -> Result<(), String> {
    let backup_path = PathBuf::from(&backup_file);

    let canonical = backup_path.canonicalize().map_err(|e| format!("Cannot resolve backup path: {}", e))?;
    let canonical_str = canonical.to_string_lossy().to_string();
    let backup_dir_canonical = config.backup_dir.canonicalize()
        .map_err(|e| format!("Cannot resolve backup directory: {}", e))?;
    let backup_dir_str = backup_dir_canonical.to_string_lossy().to_string();

    if !canonical_str.starts_with(&backup_dir_str) {
        return Err("Backup path must be within the backup directory".to_string());
    }

    backup::restore_database(&backup_path, &config.db_path)
}

fn read_excel_file(path: &PathBuf) -> Result<Vec<std::collections::HashMap<String, String>>, String> {
    use calamine::{open_workbook_auto_from_rs, Reader, Data};
    use std::io::Cursor;

    let data = fs::read(path).map_err(|e| format!("Failed to read file: {}", e))?;
    let cursor = Cursor::new(data);

    let mut workbook = open_workbook_auto_from_rs(cursor)
        .map_err(|e| format!("Failed to parse Excel file: {}", e))?;

    let mut rows = Vec::new();
    let mut headers: Vec<String> = Vec::new();

    let sheet_names = workbook.sheet_names().to_vec();
    if let Some(sheet) = sheet_names.first() {
        if let Ok(range) = workbook.worksheet_range(sheet) {
            for (row_idx, row) in range.rows().enumerate() {
                if row_idx == 0 {
                    headers = row.iter().map(|c| {
                        match c {
                            Data::String(s) => s.clone(),
                            Data::Float(f) => f.to_string(),
                            Data::Int(i) => i.to_string(),
                            Data::Bool(b) => b.to_string(),
                            _ => format!("Col_{}", row_idx),
                        }
                    }).collect();
                    continue;
                }

                let mut map = std::collections::HashMap::new();
                for (col_idx, cell) in row.iter().enumerate() {
                    if col_idx < headers.len() {
                        let value = match cell {
                            Data::String(s) => s.clone(),
                            Data::Float(f) => f.to_string(),
                            Data::Int(i) => i.to_string(),
                            Data::Bool(b) => b.to_string(),
                            Data::Empty => String::new(),
                            _ => String::new(),
                        };
                        map.insert(headers[col_idx].clone(), value);
                    }
                }
                rows.push(map);
            }
        }
    }

    Ok(rows)
}

fn read_csv_file(path: &PathBuf) -> Result<Vec<std::collections::HashMap<String, String>>, String> {
    let content = fs::read_to_string(path).map_err(|e| format!("Failed to read CSV: {}", e))?;

    let mut lines = content.lines();
    let headers: Vec<String> = match lines.next() {
        Some(h) => h.split(',').map(|s| s.trim().to_string()).collect(),
        None => return Ok(Vec::new()),
    };

    let mut rows = Vec::new();
    for line in lines {
        if line.trim().is_empty() {
            continue;
        }
        let values: Vec<String> = line.split(',').map(|s| s.trim().to_string()).collect();
        let mut map = std::collections::HashMap::new();
        for (idx, header) in headers.iter().enumerate() {
            let value = values.get(idx).cloned().unwrap_or_default();
            map.insert(header.clone(), value);
        }
        rows.push(map);
    }

    Ok(rows)
}

fn generate_error_report(
    config: &AppConfig,
    filename: &str,
    preview: &ImportPreview,
) -> Result<String, String> {
    let report_dir = config.export_dir.join("error_reports");
    fs::create_dir_all(&report_dir)
        .map_err(|e| format!("Failed to create report directory: {}", e))?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let report_name = format!("error_report_{}_{}.json", filename, timestamp);
    let report_path = report_dir.join(&report_name);

    let report = serde_json::json!({
        "filename": filename,
        "generated_at": chrono_filename(),
        "summary": {
            "total_rows": preview.total_rows,
            "valid_rows": preview.valid_rows,
            "error_rows": preview.error_rows,
            "warning_rows": preview.warning_rows,
        },
        "errors": preview.errors,
        "warnings": preview.warnings,
    });

    fs::write(&report_path, serde_json::to_string_pretty(&report).unwrap_or_default())
        .map_err(|e| format!("Failed to write error report: {}", e))?;

    Ok(report_path.to_string_lossy().to_string())
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
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
        y, m, d, hours, minutes, seconds
    )
}

fn is_leap(y: u32) -> bool {
    (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0)
}
