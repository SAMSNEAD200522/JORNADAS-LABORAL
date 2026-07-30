use log::info;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub enum EnvProfile {
    Development,
    Testing,
    Production,
    Desktop,
}

impl EnvProfile {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "testing" | "test" => Self::Testing,
            "production" | "prod" => Self::Production,
            "desktop" => Self::Desktop,
            _ => Self::Development,
        }
    }

    pub fn port(&self) -> u16 {
        match self {
            Self::Development => 3000,
            Self::Testing => 3001,
            Self::Production => 3000,
            Self::Desktop => 3000,
        }
    }

    pub fn db_name(&self) -> &str {
        match self {
            Self::Testing => "jornadas_test.db",
            _ => "jornadas.db",
        }
    }
}

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub profile: EnvProfile,
    pub app_data_dir: PathBuf,
    pub db_path: PathBuf,
    pub backup_dir: PathBuf,
    pub reports_dir: PathBuf,
    pub import_dir: PathBuf,
    pub export_dir: PathBuf,
    pub logs_dir: PathBuf,
    pub temp_dir: PathBuf,
    pub backend_dir: PathBuf,
    pub frontend_dir: PathBuf,
    pub node_dir: PathBuf,
    pub port: u16,
    pub frontend_version: String,
    pub backend_version: String,
}

impl AppConfig {
    pub fn initialize() -> Result<Self, String> {
        let profile = EnvProfile::from_str(
            &std::env::var("JORNADAS_ENV").unwrap_or_else(|_| "desktop".to_string()),
        );

        let app_data_dir = Self::resolve_app_data_dir()?;
        let exe_dir = Self::exe_dir();

        let resources_bundle = exe_dir.join("bundle");

        let backend_dir =
            Self::resolve_backend_dir(&app_data_dir, &exe_dir, &resources_bundle)?;
        let frontend_dir =
            Self::resolve_frontend_dir(&app_data_dir, &exe_dir, &resources_bundle, &backend_dir)?;
        let node_dir =
            Self::resolve_node_dir(&exe_dir, &resources_bundle, &backend_dir);

        let db_dir = app_data_dir.join("data");
        let backup_dir = app_data_dir.join("backups");
        let reports_dir = app_data_dir.join("reports");
        let import_dir = app_data_dir.join("imports");
        let export_dir = app_data_dir.join("exports");
        let logs_dir = app_data_dir.join("logs");
        let temp_dir = app_data_dir.join("temp");

        let dirs_to_create = [
            &db_dir,
            &backup_dir,
            &reports_dir,
            &import_dir,
            &export_dir,
            &logs_dir,
            &temp_dir,
        ];
        for dir in &dirs_to_create {
            std::fs::create_dir_all(dir).map_err(|e| {
                format!("Failed to create directory {}: {}", dir.display(), e)
            })?;
        }

        let db_path = db_dir.join(profile.db_name());
        let port = profile.port();

        Ok(Self {
            profile,
            app_data_dir,
            db_path,
            backup_dir,
            reports_dir,
            import_dir,
            export_dir,
            logs_dir,
            temp_dir,
            backend_dir,
            frontend_dir,
            node_dir,
            port,
            frontend_version: env!("CARGO_PKG_VERSION").to_string(),
            backend_version: String::new(),
        })
    }

    fn exe_dir() -> PathBuf {
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .unwrap_or_default()
    }

    fn resolve_app_data_dir() -> Result<PathBuf, String> {
        let custom = std::env::var("JORNADAS_DATA_DIR");
        if let Ok(path) = custom {
            return Ok(PathBuf::from(path));
        }

        let base = dirs::data_local_dir().ok_or("Cannot determine AppData directory")?;
        Ok(base.join("JornadasLaboralDesktop"))
    }

    fn resolve_backend_dir(
        app_data_dir: &PathBuf,
        exe_dir: &PathBuf,
        resources_bundle: &PathBuf,
    ) -> Result<PathBuf, String> {
        let candidates: Vec<(PathBuf, &str)> = vec![
            (resources_bundle.join("backend"), "bundled resources"),
            (exe_dir.join("backend"), "exe dir sibling"),
            (app_data_dir.join("backend"), "app data dir"),
        ];

        for (candidate, label) in &candidates {
            if candidate.join("dist").join("src").join("main.js").exists() {
                info!("Backend found at {} ({})", candidate.display(), label);
                return Ok(candidate.clone());
            }
            if candidate.join("dist").join("main.js").exists() {
                info!("Backend found at {} ({})", candidate.display(), label);
                return Ok(candidate.clone());
            }
        }

        let mut ancestor = exe_dir.clone();
        for _ in 0..8 {
            if let Some(parent) = ancestor.parent() {
                ancestor = parent.to_path_buf();
                let candidate = ancestor.join("backend");
                if candidate.join("dist").join("src").join("main.js").exists()
                    || candidate.join("dist").join("main.js").exists()
                {
                    info!("Backend found at {} (ancestor walk)", candidate.display());
                    return Ok(candidate);
                }
            } else {
                break;
            }
        }

        Err(format!(
            "Backend not found. Searched: resources bundle, exe dir, app data, ancestors of {}",
            exe_dir.display()
        ))
    }

    fn resolve_frontend_dir(
        app_data_dir: &PathBuf,
        exe_dir: &PathBuf,
        resources_bundle: &PathBuf,
        backend_dir: &PathBuf,
    ) -> Result<PathBuf, String> {
        let target = app_data_dir.join("frontend");

        if target.join("index.html").exists() {
            info!("Frontend found at AppData: {}", target.display());
            return Ok(target);
        }

        let candidates: Vec<(PathBuf, &str)> = vec![
            (resources_bundle.join("frontend"), "bundled resources"),
            (exe_dir.join("frontend"), "exe dir sibling"),
            (backend_dir.join("..").join("frontend"), "backend sibling"),
        ];

        for (candidate, label) in &candidates {
            if candidate.join("index.html").exists() {
                info!(
                    "Frontend found at {} ({}), copying to AppData",
                    candidate.display(),
                    label
                );
                let _ = std::fs::create_dir_all(&target);
                copy_dir_recursive(candidate, &target).map_err(|e| {
                    format!("Failed to copy frontend to {}: {}", target.display(), e)
                })?;
                return Ok(target);
            }
        }

        let _ = std::fs::create_dir_all(&target);
        info!("Frontend target created (empty): {}", target.display());
        Ok(target)
    }

    fn resolve_node_dir(
        exe_dir: &PathBuf,
        resources_bundle: &PathBuf,
        backend_dir: &PathBuf,
    ) -> PathBuf {
        let candidates: Vec<PathBuf> = vec![
            resources_bundle.join("node"),
            exe_dir.join("node"),
            backend_dir.join("node"),
        ];

        for candidate in &candidates {
            if candidate.join("node.exe").exists() {
                info!("Node.js found at {}", candidate.display());
                return candidate.clone();
            }
        }

        info!("Bundled Node.js not found, will use system PATH");
        PathBuf::new()
    }

    pub fn database_url(&self) -> String {
        format!("file:{}", self.db_path.display())
    }

    pub fn backend_url(&self) -> String {
        format!("http://localhost:{}", self.port)
    }

    pub fn api_url(&self) -> String {
        format!("http://localhost:{}/api/v1", self.port)
    }

    pub fn health_url(&self) -> String {
        format!("http://localhost:{}/api/v1/health", self.port)
    }
}

fn copy_dir_recursive(src: &PathBuf, dst: &PathBuf) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let dst_path = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&entry.path(), &dst_path)?;
        } else {
            std::fs::copy(entry.path(), &dst_path)?;
        }
    }
    Ok(())
}
