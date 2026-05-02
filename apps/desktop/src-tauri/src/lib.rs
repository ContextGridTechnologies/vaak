mod commands;
mod platform;
mod providers;
mod session;
mod storage;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(session::SessionStore::default())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let settings_store =
                storage::LocalSettingsStore::from_app(app.handle()).map_err(|err| err.message)?;
            app.manage(settings_store);
            let session = app.state::<session::SessionStore>();
            session::start_hotkey_monitor(app.handle(), &session);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_focused_field,
            commands::insert_text,
            commands::capture_and_insert,
            commands::insert_into_active_target,
            commands::get_hotkey_bindings,
            commands::save_provider_key,
            commands::save_provider_config,
            commands::save_speech_provider_setup,
            commands::get_provider_config,
            commands::save_selected_speech_provider,
            commands::get_selected_speech_provider,
            commands::get_provider_status,
            commands::test_speech_provider,
            commands::get_onboarding_state,
            commands::get_microphone_selection,
            commands::save_microphone_selection,
            commands::save_onboarding_mode,
            commands::save_onboarding_step,
            commands::transcribe_recording
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
