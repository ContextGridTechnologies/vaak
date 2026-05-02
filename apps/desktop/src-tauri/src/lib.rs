mod commands;
mod platform;
mod providers;
mod session;
mod storage;
mod windowing;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(session::SessionStore::default())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(voice_capsule) = app.get_webview_window("voice-capsule") {
                windowing::prepare_voice_capsule_window(&voice_capsule)?;
            }
            let settings_store =
                storage::LocalSettingsStore::from_app(app.handle()).map_err(|err| err.message)?;
            let bindings = settings_store
                .hotkey_bindings()
                .map_err(|err| err.message.clone())?;
            app.manage(settings_store);
            let session = app.state::<session::SessionStore>();
            session
                .set_dictation_hotkey(&bindings.dictation)
                .map_err(|err| err.to_string())?;
            session::start_hotkey_monitor(app.handle(), &session);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_focused_field,
            commands::insert_text,
            commands::capture_and_insert,
            commands::insert_into_active_target,
            commands::get_hotkey_bindings,
            commands::save_dictation_hotkey,
            commands::save_provider_key,
            commands::save_provider_config,
            commands::save_speech_provider_setup,
            commands::get_provider_config,
            commands::save_selected_speech_provider,
            commands::get_selected_speech_provider,
            commands::get_provider_status,
            commands::test_speech_provider,
            commands::get_onboarding_state,
            commands::get_app_shell_preferences,
            commands::save_app_shell_preferences,
            commands::get_microphone_selection,
            commands::save_microphone_selection,
            commands::save_onboarding_mode,
            commands::save_onboarding_step,
            commands::complete_onboarding,
            commands::transcribe_recording
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
