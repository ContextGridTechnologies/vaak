mod commands;
mod platform;
mod session;

use tauri::Manager;
use tauri_plugin_global_shortcut::Builder as GlobalShortcutBuilder;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(session::SessionStore::default())
        .plugin(
            GlobalShortcutBuilder::new()
                .with_handler(|app, shortcut, event| {
                    let session = app.state::<session::SessionStore>();
                    session::handle_shortcut(app, &session, &shortcut, event.state());
                })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let session = app.state::<session::SessionStore>();
            session::register_shortcuts(app.handle(), &session);
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
