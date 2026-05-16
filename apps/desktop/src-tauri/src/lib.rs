mod commands;
mod config;
mod platform;
mod providers;
mod session;
mod storage;
mod windowing;

use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};

const TRAY_OPEN_MENU_ID: &str = "tray-open";
const TRAY_QUIT_MENU_ID: &str = "tray-quit";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let runtime_config = config::RuntimeConfig::from_process_env().unwrap_or_else(|err| {
        eprintln!("invalid Vaak runtime config: {err}");
        std::process::exit(1);
    });

    let mut builder = tauri::Builder::default()
        .manage(session::SessionStore::default())
        .manage(runtime_config);

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(main_window) = app.get_webview_window("main") {
                show_unminimize_focus_window(&main_window);
            } else {
                log::warn!("single-instance reopen requested but main window was not found");
            }
        }));
    }

    builder
        .plugin(build_log_plugin(runtime_config))
        .plugin(tauri_plugin_opener::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                hide_main_window_instead_of_closing(window.label(), window, api);
            }
        })
        .setup(|app| {
            initialize_autostart_plugin(app.handle());
            initialize_tray(app.handle())?;

            if let Some(main_window) = app.get_webview_window("main") {
                let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))
                    .map_err(|err| err.to_string())?;
                main_window.set_icon(icon).map_err(|err| err.to_string())?;
            }

            let settings_store =
                storage::LocalSettingsStore::from_app(app.handle()).map_err(|err| err.message)?;
            let onboarding_completed = settings_store
                .onboarding_state()
                .map_err(|err| err.message.clone())?
                .completed;
            let app_shell_preferences = settings_store
                .app_shell_preferences()
                .map_err(|err| err.message.clone())?;
            apply_startup_launch_preference(app.handle(), &settings_store);
            if let Some(voice_capsule) = app.get_webview_window("voice-capsule") {
                windowing::prepare_voice_capsule_window(
                    &voice_capsule,
                    app_shell_preferences.voice_capsule_placement.as_ref(),
                )?;
                if onboarding_completed {
                    windowing::show_voice_capsule_window(&voice_capsule)?;
                }
            }
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
            commands::persist_dictation_audio,
            commands::load_saved_dictation_audio,
            commands::export_saved_dictation_audio,
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
            commands::get_system_settings,
            commands::save_system_settings,
            commands::get_voice_capsule_placement,
            commands::save_voice_capsule_placement,
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

trait ReopenWindow {
    fn show_window(&self) -> Result<(), String>;
    fn unminimize_window(&self) -> Result<(), String>;
    fn focus_window(&self) -> Result<(), String>;
}

impl<R: tauri::Runtime> ReopenWindow for tauri::WebviewWindow<R> {
    fn show_window(&self) -> Result<(), String> {
        self.show().map_err(|err| err.to_string())
    }

    fn unminimize_window(&self) -> Result<(), String> {
        self.unminimize().map_err(|err| err.to_string())
    }

    fn focus_window(&self) -> Result<(), String> {
        self.set_focus().map_err(|err| err.to_string())
    }
}

trait BackgroundWindow {
    fn hide_window(&self) -> Result<(), String>;
}

impl<R: tauri::Runtime> BackgroundWindow for tauri::Window<R> {
    fn hide_window(&self) -> Result<(), String> {
        self.hide().map_err(|err| err.to_string())
    }
}

trait CloseRequest {
    fn prevent_close(&self);
}

impl CloseRequest for tauri::CloseRequestApi {
    fn prevent_close(&self) {
        tauri::CloseRequestApi::prevent_close(self);
    }
}

fn show_unminimize_focus_window(window: &impl ReopenWindow) {
    if let Err(err) = window.show_window() {
        log::warn!("failed to show main window on single-instance reopen: {err}");
    }
    if let Err(err) = window.unminimize_window() {
        log::warn!("failed to unminimize main window on single-instance reopen: {err}");
    }
    if let Err(err) = window.focus_window() {
        log::warn!("failed to focus main window on single-instance reopen: {err}");
    }
}

fn hide_main_window_instead_of_closing(
    window_label: &str,
    window: &impl BackgroundWindow,
    close_request: &impl CloseRequest,
) {
    if window_label != "main" {
        return;
    }

    close_request.prevent_close();
    if let Err(err) = window.hide_window() {
        log::warn!("failed to hide main window on close request: {err}");
    }
}

trait TrayAppControl {
    fn show_main_window(&self);
    fn quit_app(&self);
}

impl<R: tauri::Runtime> TrayAppControl for tauri::AppHandle<R> {
    fn show_main_window(&self) {
        if let Some(main_window) = self.get_webview_window("main") {
            show_unminimize_focus_window(&main_window);
        } else {
            log::warn!("tray open requested but main window was not found");
        }
    }

    fn quit_app(&self) {
        self.exit(0);
    }
}

fn handle_tray_menu_event(menu_id: &str, app: &impl TrayAppControl) {
    match menu_id {
        TRAY_OPEN_MENU_ID => app.show_main_window(),
        TRAY_QUIT_MENU_ID => app.quit_app(),
        _ => {}
    }
}

fn handle_tray_icon_activation(app: &impl TrayAppControl) {
    app.show_main_window();
}

fn initialize_tray(app: &tauri::AppHandle) -> Result<(), String> {
    let menu = MenuBuilder::new(app)
        .text(TRAY_OPEN_MENU_ID, "Open Vaak")
        .separator()
        .text(TRAY_QUIT_MENU_ID, "Quit")
        .build()
        .map_err(|err| err.to_string())?;
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))
        .map_err(|err| err.to_string())?;

    TrayIconBuilder::with_id("vaak-tray")
        .icon(icon)
        .tooltip("Vaak")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            handle_tray_menu_event(event.id().as_ref(), app);
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            }
            | TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => {
                handle_tray_icon_activation(tray.app_handle());
            }
            _ => {}
        })
        .build(app)
        .map_err(|err| err.to_string())?;

    Ok(())
}

fn initialize_autostart_plugin(app: &tauri::AppHandle) {
    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::MacosLauncher;

        if let Err(err) = app.plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        )) {
            log::warn!("failed to initialize autostart plugin: {err}");
        }
    }

    #[cfg(not(desktop))]
    {
        let _ = app;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[derive(Default)]
    struct MockReopenWindow {
        calls: Mutex<Vec<&'static str>>,
    }

    impl ReopenWindow for MockReopenWindow {
        fn show_window(&self) -> Result<(), String> {
            self.calls.lock().unwrap().push("show");
            Ok(())
        }

        fn unminimize_window(&self) -> Result<(), String> {
            self.calls.lock().unwrap().push("unminimize");
            Ok(())
        }

        fn focus_window(&self) -> Result<(), String> {
            self.calls.lock().unwrap().push("focus");
            Ok(())
        }
    }

    #[test]
    fn single_instance_reopen_shows_unminimizes_and_focuses_main_window() {
        let window = MockReopenWindow::default();

        show_unminimize_focus_window(&window);

        assert_eq!(
            *window.calls.lock().unwrap(),
            vec!["show", "unminimize", "focus"]
        );
    }

    #[derive(Default)]
    struct MockBackgroundWindow {
        calls: Mutex<Vec<&'static str>>,
    }

    impl BackgroundWindow for MockBackgroundWindow {
        fn hide_window(&self) -> Result<(), String> {
            self.calls.lock().unwrap().push("hide");
            Ok(())
        }
    }

    #[derive(Default)]
    struct MockCloseRequest {
        prevented: Mutex<bool>,
    }

    impl CloseRequest for MockCloseRequest {
        fn prevent_close(&self) {
            *self.prevented.lock().unwrap() = true;
        }
    }

    #[test]
    fn main_window_close_request_hides_window_instead_of_closing_app() {
        let window = MockBackgroundWindow::default();
        let close_request = MockCloseRequest::default();

        hide_main_window_instead_of_closing("main", &window, &close_request);

        assert!(*close_request.prevented.lock().unwrap());
        assert_eq!(*window.calls.lock().unwrap(), vec!["hide"]);
    }

    #[derive(Default)]
    struct MockTrayApp {
        calls: Mutex<Vec<&'static str>>,
    }

    impl TrayAppControl for MockTrayApp {
        fn show_main_window(&self) {
            self.calls.lock().unwrap().push("show-main-window");
        }

        fn quit_app(&self) {
            self.calls.lock().unwrap().push("quit-app");
        }
    }

    #[test]
    fn tray_open_menu_event_reopens_the_main_window() {
        let app = MockTrayApp::default();

        handle_tray_menu_event(TRAY_OPEN_MENU_ID, &app);

        assert_eq!(*app.calls.lock().unwrap(), vec!["show-main-window"]);
    }

    #[test]
    fn tray_quit_menu_event_exits_the_app() {
        let app = MockTrayApp::default();

        handle_tray_menu_event(TRAY_QUIT_MENU_ID, &app);

        assert_eq!(*app.calls.lock().unwrap(), vec!["quit-app"]);
    }

    #[test]
    fn unknown_tray_menu_events_are_ignored() {
        let app = MockTrayApp::default();

        handle_tray_menu_event("other-menu-item", &app);

        assert!(app.calls.lock().unwrap().is_empty());
    }

    #[test]
    fn tray_icon_activation_reopens_the_main_window() {
        let app = MockTrayApp::default();

        handle_tray_icon_activation(&app);

        assert_eq!(*app.calls.lock().unwrap(), vec!["show-main-window"]);
    }
}

fn apply_startup_launch_preference(
    app: &tauri::AppHandle,
    settings_store: &storage::LocalSettingsStore,
) {
    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::ManagerExt;

        let Ok(system_settings) = settings_store.system_settings() else {
            log::warn!("failed to load system settings for startup registration");
            return;
        };

        let autostart_manager = app.autolaunch();
        let result = if system_settings.launch_on_startup {
            autostart_manager.enable()
        } else {
            autostart_manager.disable()
        };

        if let Err(err) = result {
            log::warn!("failed to apply startup launch preference: {err}");
        }
    }

    #[cfg(not(desktop))]
    {
        let _ = (app, settings_store);
    }
}

fn build_log_plugin(
    runtime_config: config::RuntimeConfig,
) -> tauri::plugin::TauriPlugin<tauri::Wry> {
    #[cfg(debug_assertions)]
    {
        let builder = tauri_plugin_log::Builder::new()
            .clear_targets()
            .target(Target::new(TargetKind::LogDir {
                file_name: Some("backend".to_string()),
            }))
            .level(runtime_config.log_level.as_level_filter())
            .level_for(
                "vaak_desktop_lib::platform::windows",
                runtime_config.log_level.as_level_filter(),
            )
            .target(Target::new(TargetKind::Stdout));
        return builder.build();
    }

    #[cfg(not(debug_assertions))]
    {
        tauri_plugin_log::Builder::new()
            .clear_targets()
            .target(Target::new(TargetKind::LogDir {
                file_name: Some("backend".to_string()),
            }))
            .level(runtime_config.log_level.as_level_filter())
            .level_for(
                "vaak_desktop_lib::platform::windows",
                runtime_config.log_level.as_level_filter(),
            )
            .build()
    }
}
