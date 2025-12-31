mod commands;
mod platform;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_focused_field,
            commands::insert_text,
            commands::capture_and_insert
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
