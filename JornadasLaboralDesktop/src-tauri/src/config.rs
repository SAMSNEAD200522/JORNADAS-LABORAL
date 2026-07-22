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
        let backend_dir = Self::resolve_backend_dir(&app_data_dir)?;

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
            port,
            frontend_version: env!("CARGO_PKG_VERSION").to_string(),
            backend_version: String::new(),
        })
    }

    fn resolve_app_data_dir() -> Result<PathBuf, String> {
        let custom = std::env::var("JORNADAS_DATA_DIR");
        if let Ok(path) = custom {
            return Ok(PathBuf::from(path));
        }

        let base = dirs::data_local_dir().ok_or("Cannot determine AppData directory")?;
        Ok(base.join("JornadasLaboralDesktop"))
    }

    fn resolve_backend_dir(app_data_dir: &PathBuf) -> Result<PathBuf, String> {
        let exe_dir = std::env::current_exe()
            .map_err(|e| format!("Cannot determine exe directory: {}", e))?
            .parent()
            .ok_or("Cannot determine exe parent directory")?
            .to_path_buf();

        let mut candidates: Vec<PathBuf> = vec![
            exe_dir.join("backend"),
            app_data_dir.join("backend"),
        ];

        // Walk up from exe_dir to find the project root containing backend/
        let mut ancestor = exe_dir.clone();
        for _ in 0..8 {
            if let Some(parent) = ancestor.parent() {
                ancestor = parent.to_path_buf();
                let candidate = ancestor.join("backend");
                if !candidates.contains(&candidate) {
                    candidates.push(candidate);
                }
            } else {
                break;
            }
        }

        for candidate in &candidates {
            if candidate.join("dist").join("src").join("main.js").exists() {
                return Ok(candidate.clone());
            }
            if candidate.join("dist").join("main.js").exists() {
                return Ok(candidate.clone());
            }
            if candidate.join("package.json").exists() {
                return Ok(candidate.clone());
            }
        }

        Ok(exe_dir.join("backend"))
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
