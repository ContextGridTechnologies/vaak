mod commands;
mod config;
mod platform;
mod providers;
mod session;
mod stability;
mod storage;
mod windowing;

use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};
use tauri_plugin_log::{Target, TargetKind};

const TRAY_OPEN_MENU_ID: &str = "tray-open";
const TRAY_RESTART_CAPSULE_MENU_ID: &str = "tray-restart-capsule";
const TRAY_RESET_CAPSULE_MENU_ID: &str = "tray-reset-capsule";
const TRAY_QUIT_MENU_ID: &str = "tray-quit";
const RENDERER_REOPEN_PROBE_EVENT: &str = "vaak://renderer-reopen-probe";

#[derive(Clone, serde::Serialize)]
struct RendererReopenProbePayload<'a> {
    source: &'a str,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    stability::initialize_panic_logging();
    let startup_diagnostics = stability::StartupDiagnostics::new();
    eprintln!(
        "{}",
        stability::format_startup_checkpoint(
            startup_diagnostics.run_id(),
            "backend",
            None,
            "runtime_config_validation_started",
            None,
        )
    );

    let runtime_config = config::RuntimeConfig::from_process_env().unwrap_or_else(|err| {
        eprintln!(
            "{}",
            stability::format_startup_checkpoint(
                startup_diagnostics.run_id(),
                "backend",
                None,
                "runtime_config_validation_failed",
                Some(&err.to_string()),
            )
        );
        eprintln!("invalid Vaak runtime config: {err}");
        std::process::exit(1);
    });
    eprintln!(
        "{}",
        stability::format_startup_checkpoint(
            startup_diagnostics.run_id(),
            "backend",
            None,
            "runtime_config_loaded",
            None,
        )
    );

    let mut builder = tauri::Builder::default()
        .manage(session::SessionStore::default())
        .manage(stability::RendererHealth::default())
        .manage(stability::VoiceCapsuleReadiness::new(
            startup_diagnostics.run_id(),
        ))
        .manage(startup_diagnostics.clone())
        .manage(runtime_config);

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let startup_diagnostics = app.state::<stability::StartupDiagnostics>();
            startup_diagnostics.record_backend_checkpoint("single_instance_reopen_requested", None);
            if let Some(main_window) = app.get_webview_window("main") {
                startup_diagnostics
                    .record_backend_checkpoint("single_instance_main_window_found", None);
                show_unminimize_focus_window(&main_window, "single-instance");
                startup_diagnostics.record_backend_checkpoint(
                    "single_instance_main_window_reopen_completed",
                    None,
                );
            } else {
                startup_diagnostics
                    .record_backend_checkpoint("single_instance_main_window_not_found", None);
                log::warn!("single-instance reopen requested but main window was not found");
            }
        }));
    }

    builder
        .plugin(build_log_plugin(runtime_config))
        .plugin(tauri_plugin_opener::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let startup_diagnostics =
                    window.app_handle().state::<stability::StartupDiagnostics>();
                hide_main_window_instead_of_closing(
                    window.label(),
                    window,
                    api,
                    Some(&startup_diagnostics),
                );
            }
            if let tauri::WindowEvent::ThemeChanged(theme) = event {
                if window.label() == "main" {
                    if let Err(err) = windowing::apply_main_window_theme(window, *theme) {
                        log::warn!("failed to apply main window theme: {err}");
                    }
                }
            }
        })
        .setup(|app| {
            let startup_diagnostics = app.state::<stability::StartupDiagnostics>().inner().clone();
            startup_diagnostics.record_backend_checkpoint("setup_started", None);
            log_startup_app_paths(app.handle(), &startup_diagnostics);

            stability::initialize_process_recovery();
            startup_diagnostics.record_backend_checkpoint("process_recovery_initialized", None);
            initialize_autostart_plugin(app.handle(), &startup_diagnostics);
            match initialize_tray(app.handle()) {
                Ok(()) => startup_diagnostics.record_backend_checkpoint("tray_initialized", None),
                Err(err) => {
                    startup_diagnostics
                        .record_backend_checkpoint("tray_initialization_failed", Some(&err));
                    return Err(err.into());
                }
            }

            if let Some(main_window) = app.get_webview_window("main") {
                let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))
                    .map_err(|err| err.to_string())?;
                main_window.set_icon(icon).map_err(|err| err.to_string())?;
                if let Err(err) = windowing::prepare_main_window(&main_window) {
                    startup_diagnostics
                        .record_backend_checkpoint("main_window_prepare_failed", Some(&err));
                    log::warn!("failed to prepare main window chrome: {err}");
                } else {
                    startup_diagnostics.record_backend_checkpoint("main_window_prepared", None);
                }
            } else {
                startup_diagnostics.record_backend_checkpoint("main_window_not_found", None);
            }

            let settings_store = match storage::LocalSettingsStore::from_app(app.handle()) {
                Ok(store) => {
                    startup_diagnostics
                        .record_backend_checkpoint("local_settings_store_created", None);
                    store
                }
                Err(err) => {
                    startup_diagnostics.record_backend_checkpoint(
                        "local_settings_store_failed",
                        Some(&err.message),
                    );
                    return Err(err.message.into());
                }
            };
            let onboarding_completed = load_startup_onboarding_completed_with_diagnostics(
                &settings_store,
                &startup_diagnostics,
            );
            let app_shell_preferences = load_startup_app_shell_preferences_with_diagnostics(
                &settings_store,
                &startup_diagnostics,
            );
            apply_startup_launch_preference(app.handle(), &settings_store, &startup_diagnostics);
            if let Some(voice_capsule) = app.get_webview_window("voice-capsule") {
                windowing::prepare_voice_capsule_window(
                    &voice_capsule,
                    app_shell_preferences.voice_capsule_placement.as_ref(),
                )?;
                startup_diagnostics.record_backend_checkpoint("voice_capsule_prepared", None);
                if onboarding_completed && app_shell_preferences.voice_capsule_enabled {
                    windowing::show_voice_capsule_window(&voice_capsule)?;
                    startup_diagnostics.record_backend_checkpoint("voice_capsule_shown", None);
                    record_voice_capsule_native_state(&voice_capsule, &startup_diagnostics);
                } else if onboarding_completed {
                    startup_diagnostics
                        .record_backend_checkpoint("voice_capsule_disabled_by_user", None);
                } else {
                    startup_diagnostics
                        .record_backend_checkpoint("voice_capsule_hidden_until_onboarding", None);
                }
            } else {
                startup_diagnostics.record_backend_checkpoint("voice_capsule_not_found", None);
            }
            let records_store = storage::LocalDictationRecordStore::new(
                app.path().app_config_dir().map_err(|err| err.to_string())?,
            );
            startup_diagnostics.record_backend_checkpoint("dictation_record_store_created", None);
            let bindings = load_startup_hotkey_bindings_with_diagnostics(
                &settings_store,
                &startup_diagnostics,
            );
            app.manage(settings_store);
            app.manage(records_store);
            let session = app.state::<session::SessionStore>();
            session
                .set_dictation_hotkey(&bindings.dictation)
                .map_err(|err| err.to_string())?;
            startup_diagnostics.record_backend_checkpoint("dictation_hotkey_set", None);
            session::start_hotkey_monitor(app.handle(), &session);
            startup_diagnostics.record_backend_checkpoint("hotkey_monitor_started", None);
            stability::start_renderer_watchdog(app.handle().clone());
            startup_diagnostics.record_backend_checkpoint("renderer_watchdog_started", None);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::record_startup_checkpoint,
            commands::record_renderer_heartbeat,
            commands::record_renderer_error,
            commands::get_voice_capsule_ready_challenge,
            commands::record_voice_capsule_ready,
            commands::get_diagnostics_locations,
            commands::get_focused_field,
            commands::capture_dictation_target,
            commands::insert_text,
            commands::capture_and_insert,
            commands::get_accessibility_permission_status,
            commands::get_input_monitoring_permission_status,
            commands::insert_into_active_target,
            commands::get_hotkey_bindings,
            commands::save_dictation_hotkey,
            commands::save_dictation_record,
            commands::update_dictation_record,
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
            commands::set_voice_capsule_size_mode,
            commands::open_main_window,
            commands::restart_voice_capsule,
            commands::reset_voice_capsule_position,
            commands::disable_voice_capsule,
            commands::enable_voice_capsule,
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
    fn emit_reopen_probe(&self, source: &str) -> Result<(), String>;
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

    fn emit_reopen_probe(&self, source: &str) -> Result<(), String> {
        self.emit(
            RENDERER_REOPEN_PROBE_EVENT,
            RendererReopenProbePayload { source },
        )
        .map_err(|err| err.to_string())
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

fn show_unminimize_focus_window(window: &impl ReopenWindow, source: &str) {
    if let Err(err) = window.show_window() {
        log::warn!("failed to show main window on reopen: {err}");
    }
    if let Err(err) = window.unminimize_window() {
        log::warn!("failed to unminimize main window on reopen: {err}");
    }
    if let Err(err) = window.focus_window() {
        log::warn!("failed to focus main window on reopen: {err}");
    }
    if let Err(err) = window.emit_reopen_probe(source) {
        log::warn!("failed to emit renderer reopen probe: {err}");
    }
}

fn hide_main_window_instead_of_closing(
    window_label: &str,
    window: &impl BackgroundWindow,
    close_request: &impl CloseRequest,
    startup_diagnostics: Option<&stability::StartupDiagnostics>,
) {
    if window_label != "main" {
        return;
    }

    if let Some(startup_diagnostics) = startup_diagnostics {
        startup_diagnostics.record_backend_checkpoint("main_window_close_intercepted", None);
    }
    close_request.prevent_close();
    if let Err(err) = window.hide_window() {
        if let Some(startup_diagnostics) = startup_diagnostics {
            startup_diagnostics.record_backend_checkpoint("main_window_hide_failed", Some(&err));
        }
        log::warn!("failed to hide main window on close request: {err}");
    } else if let Some(startup_diagnostics) = startup_diagnostics {
        startup_diagnostics.record_backend_checkpoint("main_window_hidden_to_tray", None);
    }
}

trait TrayAppControl {
    fn show_main_window(&self);
    fn restart_voice_capsule(&self);
    fn reset_voice_capsule_position(&self);
    fn quit_app(&self);
}

impl<R: tauri::Runtime> TrayAppControl for tauri::AppHandle<R> {
    fn show_main_window(&self) {
        let startup_diagnostics = self.state::<stability::StartupDiagnostics>();
        startup_diagnostics.record_backend_checkpoint("tray_open_requested", None);
        if let Some(main_window) = self.get_webview_window("main") {
            startup_diagnostics.record_backend_checkpoint("tray_main_window_found", None);
            show_unminimize_focus_window(&main_window, "tray");
            startup_diagnostics
                .record_backend_checkpoint("tray_main_window_reopen_completed", None);
        } else {
            startup_diagnostics.record_backend_checkpoint("tray_main_window_not_found", None);
            log::warn!("tray open requested but main window was not found");
        }
    }

    fn restart_voice_capsule(&self) {
        let startup_diagnostics = self.state::<stability::StartupDiagnostics>();
        let settings = self.state::<storage::LocalSettingsStore>();
        let readiness = self.state::<stability::VoiceCapsuleReadiness>();
        let health = self.state::<stability::RendererHealth>();
        if let Err(err) = commands::restart_voice_capsule_for_app(
            self,
            &settings,
            &readiness,
            &health,
            &startup_diagnostics,
        ) {
            startup_diagnostics
                .record_backend_checkpoint("tray_voice_capsule_restart_failed", Some(&err.message));
            log::warn!("failed to restart voice capsule from tray: {}", err.message);
        }
    }

    fn reset_voice_capsule_position(&self) {
        let startup_diagnostics = self.state::<stability::StartupDiagnostics>();
        let settings = self.state::<storage::LocalSettingsStore>();
        if let Err(err) =
            commands::reset_voice_capsule_position_for_app(self, &settings, &startup_diagnostics)
        {
            startup_diagnostics.record_backend_checkpoint(
                "tray_voice_capsule_position_reset_failed",
                Some(&err.message),
            );
            log::warn!(
                "failed to reset voice capsule position from tray: {}",
                err.message
            );
        }
    }

    fn quit_app(&self) {
        let startup_diagnostics = self.state::<stability::StartupDiagnostics>();
        startup_diagnostics.record_backend_checkpoint("tray_quit_requested", None);
        if let Some(readiness) = self.try_state::<stability::VoiceCapsuleReadiness>() {
            readiness.mark_shutting_down();
        }
        self.exit(0);
    }
}

fn handle_tray_menu_event(menu_id: &str, app: &impl TrayAppControl) {
    match menu_id {
        TRAY_OPEN_MENU_ID => app.show_main_window(),
        TRAY_RESTART_CAPSULE_MENU_ID => app.restart_voice_capsule(),
        TRAY_RESET_CAPSULE_MENU_ID => app.reset_voice_capsule_position(),
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
        .text(TRAY_RESTART_CAPSULE_MENU_ID, "Restart voice capsule")
        .text(TRAY_RESET_CAPSULE_MENU_ID, "Reset capsule position")
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

fn initialize_autostart_plugin(
    app: &tauri::AppHandle,
    startup_diagnostics: &stability::StartupDiagnostics,
) {
    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::MacosLauncher;

        if let Err(err) = app.plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        )) {
            startup_diagnostics.record_backend_checkpoint(
                "autostart_plugin_initialization_failed",
                Some(&err.to_string()),
            );
            log::warn!("failed to initialize autostart plugin: {err}");
        } else {
            startup_diagnostics.record_backend_checkpoint("autostart_plugin_initialized", None);
        }
    }

    #[cfg(not(desktop))]
    {
        let _ = app;
        startup_diagnostics.record_backend_checkpoint("autostart_plugin_skipped", None);
    }
}

#[cfg(test)]
fn load_startup_onboarding_completed(settings_store: &storage::LocalSettingsStore) -> bool {
    load_startup_onboarding_completed_impl(settings_store, None)
}

fn load_startup_onboarding_completed_with_diagnostics(
    settings_store: &storage::LocalSettingsStore,
    startup_diagnostics: &stability::StartupDiagnostics,
) -> bool {
    load_startup_onboarding_completed_impl(settings_store, Some(startup_diagnostics))
}

fn load_startup_onboarding_completed_impl(
    settings_store: &storage::LocalSettingsStore,
    startup_diagnostics: Option<&stability::StartupDiagnostics>,
) -> bool {
    match settings_store.onboarding_state() {
        Ok(state) => {
            if let Some(startup_diagnostics) = startup_diagnostics {
                startup_diagnostics.record_backend_checkpoint(
                    "startup_onboarding_loaded",
                    Some(if state.completed {
                        "completed"
                    } else {
                        "incomplete"
                    }),
                );
            }
            state.completed
        }
        Err(err) => {
            if let Some(startup_diagnostics) = startup_diagnostics {
                startup_diagnostics
                    .record_backend_checkpoint("startup_onboarding_failed", Some(&err.message));
            }
            log::warn!(
                "failed to load onboarding state during startup; treating onboarding as incomplete: {}",
                err.message
            );
            false
        }
    }
}

#[cfg(test)]
fn load_startup_app_shell_preferences(
    settings_store: &storage::LocalSettingsStore,
) -> storage::AppShellPreferences {
    load_startup_app_shell_preferences_impl(settings_store, None)
}

fn load_startup_app_shell_preferences_with_diagnostics(
    settings_store: &storage::LocalSettingsStore,
    startup_diagnostics: &stability::StartupDiagnostics,
) -> storage::AppShellPreferences {
    load_startup_app_shell_preferences_impl(settings_store, Some(startup_diagnostics))
}

fn load_startup_app_shell_preferences_impl(
    settings_store: &storage::LocalSettingsStore,
    startup_diagnostics: Option<&stability::StartupDiagnostics>,
) -> storage::AppShellPreferences {
    match settings_store.app_shell_preferences() {
        Ok(preferences) => {
            if let Some(startup_diagnostics) = startup_diagnostics {
                startup_diagnostics.record_backend_checkpoint(
                    "startup_app_shell_preferences_loaded",
                    Some(if preferences.sidebar_collapsed {
                        "sidebarCollapsed=true"
                    } else {
                        "sidebarCollapsed=false"
                    }),
                );
            }
            preferences
        }
        Err(err) => {
            if let Some(startup_diagnostics) = startup_diagnostics {
                startup_diagnostics.record_backend_checkpoint(
                    "startup_app_shell_preferences_defaulted",
                    Some(&err.message),
                );
            }
            log::warn!(
                "failed to load app shell preferences during startup; using defaults: {}",
                err.message
            );
            storage::AppShellPreferences::default()
        }
    }
}

#[cfg(test)]
fn load_startup_hotkey_bindings(
    settings_store: &storage::LocalSettingsStore,
) -> session::HotkeyBindings {
    load_startup_hotkey_bindings_impl(settings_store, None)
}

fn load_startup_hotkey_bindings_with_diagnostics(
    settings_store: &storage::LocalSettingsStore,
    startup_diagnostics: &stability::StartupDiagnostics,
) -> session::HotkeyBindings {
    load_startup_hotkey_bindings_impl(settings_store, Some(startup_diagnostics))
}

fn load_startup_hotkey_bindings_impl(
    settings_store: &storage::LocalSettingsStore,
    startup_diagnostics: Option<&stability::StartupDiagnostics>,
) -> session::HotkeyBindings {
    match settings_store.hotkey_bindings() {
        Ok(bindings) => {
            if let Some(startup_diagnostics) = startup_diagnostics {
                startup_diagnostics.record_backend_checkpoint("startup_hotkeys_loaded", None);
            }
            bindings
        }
        Err(err) => {
            if let Some(startup_diagnostics) = startup_diagnostics {
                startup_diagnostics
                    .record_backend_checkpoint("startup_hotkeys_defaulted", Some(&err.message));
            }
            log::warn!(
                "failed to load hotkey bindings during startup; using defaults: {}",
                err.message
            );
            session::SessionStore::default().hotkey_bindings()
        }
    }
}

fn log_startup_app_paths(
    app: &tauri::AppHandle,
    startup_diagnostics: &stability::StartupDiagnostics,
) {
    match app.path().app_config_dir() {
        Ok(path) => startup_diagnostics
            .record_backend_checkpoint("app_config_dir_resolved", Some(&path.to_string_lossy())),
        Err(err) => startup_diagnostics
            .record_backend_checkpoint("app_config_dir_failed", Some(&err.to_string())),
    }

    match app.path().app_log_dir() {
        Ok(path) => startup_diagnostics
            .record_backend_checkpoint("app_log_dir_resolved", Some(&path.to_string_lossy())),
        Err(err) => startup_diagnostics
            .record_backend_checkpoint("app_log_dir_failed", Some(&err.to_string())),
    }
}

fn record_voice_capsule_native_state<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    startup_diagnostics: &stability::StartupDiagnostics,
) {
    let visibility_detail = match window.is_visible() {
        Ok(true) => "visible=true".to_string(),
        Ok(false) => "visible=false".to_string(),
        Err(err) => format!("error={err}"),
    };
    startup_diagnostics
        .record_backend_checkpoint("voice_capsule_visibility_checked", Some(&visibility_detail));

    let bounds_detail = voice_capsule_bounds_detail(window)
        .unwrap_or_else(|err| format!("onScreen=false error={err}"));
    startup_diagnostics
        .record_backend_checkpoint("voice_capsule_bounds_checked", Some(&bounds_detail));
}

fn voice_capsule_bounds_detail<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<String, String> {
    let position = window.outer_position().map_err(|err| err.to_string())?;
    let size = window.outer_size().map_err(|err| err.to_string())?;
    let monitor = window.current_monitor().map_err(|err| err.to_string())?;
    let on_screen = monitor
        .map(|monitor| {
            let work_area = monitor.work_area();
            let left = position.x;
            let top = position.y;
            let right = left.saturating_add(size.width as i32);
            let bottom = top.saturating_add(size.height as i32);
            let work_left = work_area.position.x;
            let work_top = work_area.position.y;
            let work_right = work_left.saturating_add(work_area.size.width as i32);
            let work_bottom = work_top.saturating_add(work_area.size.height as i32);

            left >= work_left && top >= work_top && right <= work_right && bottom <= work_bottom
        })
        .unwrap_or(false);

    Ok(format!(
        "onScreen={} x={} y={} width={} height={}",
        if on_screen { "true" } else { "false" },
        position.x,
        position.y,
        size.width,
        size.height
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::Mutex;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_config_dir(name: &str) -> std::path::PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        std::env::temp_dir().join(format!("vaak-startup-{name}-{suffix}"))
    }

    fn default_startup_bindings() -> session::HotkeyBindings {
        session::SessionStore::default().hotkey_bindings()
    }

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

        fn emit_reopen_probe(&self, _source: &str) -> Result<(), String> {
            self.calls.lock().unwrap().push("emit-reopen-probe");
            Ok(())
        }
    }

    #[test]
    fn single_instance_reopen_shows_unminimizes_and_focuses_main_window() {
        let window = MockReopenWindow::default();

        show_unminimize_focus_window(&window, "single-instance");

        assert_eq!(
            *window.calls.lock().unwrap(),
            vec!["show", "unminimize", "focus", "emit-reopen-probe"]
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

        hide_main_window_instead_of_closing("main", &window, &close_request, None);

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

        fn restart_voice_capsule(&self) {
            self.calls.lock().unwrap().push("restart-voice-capsule");
        }

        fn reset_voice_capsule_position(&self) {
            self.calls
                .lock()
                .unwrap()
                .push("reset-voice-capsule-position");
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
    fn tray_capsule_restart_menu_event_restarts_the_voice_capsule() {
        let app = MockTrayApp::default();

        handle_tray_menu_event(TRAY_RESTART_CAPSULE_MENU_ID, &app);

        assert_eq!(*app.calls.lock().unwrap(), vec!["restart-voice-capsule"]);
    }

    #[test]
    fn tray_capsule_reset_menu_event_resets_the_voice_capsule_position() {
        let app = MockTrayApp::default();

        handle_tray_menu_event(TRAY_RESET_CAPSULE_MENU_ID, &app);

        assert_eq!(
            *app.calls.lock().unwrap(),
            vec!["reset-voice-capsule-position"]
        );
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

    #[test]
    fn startup_settings_helpers_use_defaults_without_creating_settings_file() {
        let dir = temp_config_dir("missing");
        let store = storage::LocalSettingsStore::new(&dir);

        assert!(!load_startup_onboarding_completed(&store));
        assert_eq!(
            load_startup_app_shell_preferences(&store),
            storage::AppShellPreferences::default()
        );
        let bindings = load_startup_hotkey_bindings(&store);
        let default_bindings = default_startup_bindings();
        assert_eq!(bindings.dictation, default_bindings.dictation);
        assert_eq!(bindings.command, default_bindings.command);
        assert!(!dir.join("settings.json").exists());
    }

    #[test]
    fn startup_settings_helpers_recover_from_malformed_settings_file() {
        let dir = temp_config_dir("malformed");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("settings.json"), "{").unwrap();
        let store = storage::LocalSettingsStore::new(&dir);

        assert!(!load_startup_onboarding_completed(&store));
        assert_eq!(
            load_startup_app_shell_preferences(&store),
            storage::AppShellPreferences::default()
        );
        let bindings = load_startup_hotkey_bindings(&store);
        let default_bindings = default_startup_bindings();
        assert_eq!(bindings.dictation, default_bindings.dictation);
        assert_eq!(bindings.command, default_bindings.command);
    }

    #[test]
    fn startup_hotkey_helper_recovers_from_invalid_saved_hotkey() {
        let dir = temp_config_dir("invalid-hotkey");
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("settings.json"),
            r#"{
  "version": 1,
  "selectedSpeechProvider": "openai",
  "providerConfigs": {},
  "hotkeys": {
    "dictation": "Ctrl"
  }
}"#,
        )
        .unwrap();
        let store = storage::LocalSettingsStore::new(&dir);

        let bindings = load_startup_hotkey_bindings(&store);
        let default_bindings = default_startup_bindings();

        assert_eq!(bindings.dictation, default_bindings.dictation);
        assert_eq!(bindings.command, default_bindings.command);
    }

    #[test]
    fn startup_helpers_recover_from_invalid_microphone_selection() {
        let dir = temp_config_dir("invalid-microphone");
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("settings.json"),
            r#"{
  "version": 1,
  "selectedSpeechProvider": "openai",
  "providerConfigs": {},
  "microphoneSelection": {
    "mode": "manual",
    "deviceId": ""
  },
  "onboarding": {
    "completed": true,
    "currentStep": "hotkeyReadiness",
    "selectedMode": "local"
  }
}"#,
        )
        .unwrap();
        let store = storage::LocalSettingsStore::new(&dir);

        assert!(load_startup_onboarding_completed(&store));
        assert_eq!(
            load_startup_app_shell_preferences(&store),
            storage::AppShellPreferences::default()
        );
        let bindings = load_startup_hotkey_bindings(&store);
        let default_bindings = default_startup_bindings();
        assert_eq!(bindings.dictation, default_bindings.dictation);
        assert_eq!(bindings.command, default_bindings.command);
    }

    #[test]
    fn startup_helpers_do_not_backfill_identity() {
        let dir = temp_config_dir("identity");
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("settings.json"),
            r#"{
  "version": 1,
  "selectedSpeechProvider": "openai",
  "providerConfigs": {},
  "hotkeys": {
    "dictation": "Ctrl+Win"
  },
  "onboarding": {
    "completed": false,
    "currentStep": "modeChoice",
    "selectedMode": null
  }
}"#,
        )
        .unwrap();
        let store = storage::LocalSettingsStore::new(&dir);

        load_startup_onboarding_completed(&store);
        load_startup_app_shell_preferences(&store);
        load_startup_hotkey_bindings(&store);

        let json = fs::read_to_string(dir.join("settings.json")).unwrap();
        assert!(!json.contains("\"identity\""));
    }
}

fn apply_startup_launch_preference(
    app: &tauri::AppHandle,
    settings_store: &storage::LocalSettingsStore,
    startup_diagnostics: &stability::StartupDiagnostics,
) {
    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::ManagerExt;

        let Ok(system_settings) = settings_store.system_settings() else {
            startup_diagnostics
                .record_backend_checkpoint("launch_on_startup_preference_failed_to_load", None);
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
            startup_diagnostics.record_backend_checkpoint(
                "launch_on_startup_preference_failed",
                Some(&err.to_string()),
            );
            log::warn!("failed to apply startup launch preference: {err}");
        } else {
            startup_diagnostics.record_backend_checkpoint(
                "launch_on_startup_preference_applied",
                Some(if system_settings.launch_on_startup {
                    "enabled"
                } else {
                    "disabled"
                }),
            );
        }
    }

    #[cfg(not(desktop))]
    {
        let _ = (app, settings_store);
        startup_diagnostics.record_backend_checkpoint("launch_on_startup_preference_skipped", None);
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
