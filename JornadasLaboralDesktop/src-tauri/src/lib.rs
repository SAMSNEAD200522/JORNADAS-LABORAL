mod backup;
mod commands;
mod config;
mod import_engine;
mod sidecar;
mod startup;

use std::sync::atomic::{AtomicBool, Ordering};

static SHUTTING_DOWN: AtomicBool = AtomicBool::new(false);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            use tauri::Manager;

            let app_handle = app.handle().clone();

            let startup_result = match startup::run_startup(app_handle.clone()) {
                Ok(result) => result,
                Err(e) => {
                    eprintln!("FATAL: Application startup failed: {}", e);

                    use tauri_plugin_dialog::DialogExt;
                    let _ = app_handle
                        .dialog()
                        .message(format!(
                            "No se pudo iniciar la aplicacion:\n\n{}\n\nLa aplicacion se cerrara.",
                            e
                        ))
                        .title("Error de Inicializacion")
                        .blocking_show();

                    std::process::exit(1);
                }
            };

            app.manage(startup_result.config.clone());
            app.manage(startup_result.sidecar_handle.clone());

            if let Some(window) = app.get_webview_window("main") {
                let url = startup_result.config.backend_url();
                if let Ok(parsed) = url.parse::<tauri::Url>() {
                    let _ = window.navigate(parsed);
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if SHUTTING_DOWN.swap(true, Ordering::SeqCst) {
                    return;
                }
                log::info!("Window close requested, performing graceful shutdown...");
                use tauri::Manager;
                if let Some(sidecar) =
                    window.try_state::<std::sync::Arc<sidecar::SidecarManager>>()
                {
                    startup::run_shutdown(&sidecar);
                }
                api.prevent_close();
                window.destroy().ok();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_version,
            commands::get_system_info,
            commands::append_frontend_log,
            commands::create_backup,
            commands::open_in_explorer,
            commands::open_file_dialog,
            commands::save_file_dialog,
            commands::open_directory_dialog,
            commands::save_download_file,
            commands::save_download_file_post,
            import_engine::import_file,
            import_engine::preview_import,
            import_engine::get_import_history,
            import_engine::download_error_report,
            import_engine::rollback_import,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
