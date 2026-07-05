mod commands;

use commands::auth;
use commands::files;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            auth::save_token,
            auth::load_token,
            auth::clear_token,
            auth::check_token_expiry,
            files::open_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
