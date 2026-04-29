mod commands;
mod platform;
mod session;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(session::SessionStore::default())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let session = app.state::<session::SessionStore>();
            session::start_hotkey_monitor(app.handle(), &session);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_focused_field,
            commands::insert_text,
            commands::capture_and_insert,
            commands::insert_into_active_target,
            commands::get_hotkey_bindings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
