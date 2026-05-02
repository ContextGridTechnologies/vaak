mod commands;
mod platform;
mod providers;
mod session;
mod storage;
mod windowing;

use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(session::SessionStore::default())
        .plugin(build_log_plugin())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(voice_capsule) = app.get_webview_window("voice-capsule") {
                windowing::prepare_voice_capsule_window(&voice_capsule)?;
            }
            let settings_store =
                storage::LocalSettingsStore::from_app(app.handle()).map_err(|err| err.message)?;
            settings_store
                .local_identity()
                .map_err(|err| err.message.clone())?;
            let records_store = storage::LocalDictationRecordStore::new(
                app.path().app_config_dir().map_err(|err| err.to_string())?,
            );
            let bindings = settings_store
                .hotkey_bindings()
                .map_err(|err| err.message.clone())?;
            app.manage(settings_store);
            app.manage(records_store);
            let session = app.state::<session::SessionStore>();
            session
                .set_dictation_hotkey(&bindings.dictation)
                .map_err(|err| err.to_string())?;
            session::start_hotkey_monitor(app.handle(), &session);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_focused_field,
            commands::capture_dictation_target,
            commands::insert_text,
            commands::capture_and_insert,
            commands::insert_into_active_target,
            commands::get_hotkey_bindings,
            commands::save_dictation_hotkey,
            commands::save_dictation_record,
            commands::get_recent_dictation_records,
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

fn build_log_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    let mut builder = tauri_plugin_log::Builder::new()
        .clear_targets()
        .target(Target::new(TargetKind::LogDir {
            file_name: Some("backend".to_string()),
        }))
        .level(log::LevelFilter::Info)
        .level_for("appsdesktop_lib::platform::windows", log::LevelFilter::Trace);

    #[cfg(debug_assertions)]
    {
        builder = builder.target(Target::new(TargetKind::Stdout));
    }

    builder.build()
}
