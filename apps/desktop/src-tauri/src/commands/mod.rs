use crate::platform;
use crate::platform::common::{
    CaptureInsertResult, FocusedFieldInfo, PermissionStatus, PlatformError, TextInsertResult,
};
use crate::providers::credentials;
use crate::providers::errors::{ProviderError, ProviderFailure};
use crate::providers::speech::assemblyai_streaming::{
    self, AssemblyAiStreamingCommandEvent, AssemblyAiStreamingStartResult,
    ManagedAssemblyAiStreamingState, StreamingAudioWrite,
};
use crate::providers::{
    speech, ProviderConfig, ProviderStatus, TranscriptResult, TranscriptionInput,
};
use crate::session::{HotkeyBindings, SessionStore};
use crate::stability::{
    RendererHealth, StartupDiagnostics, VoiceCapsuleReadiness, VoiceCapsuleReadyAck,
    VoiceCapsuleReadyChallenge, VoiceCapsuleReadyInput, MAIN_WINDOW_LABEL, VOICE_CAPSULE_LABEL,
};
use crate::storage::{
    AppShellPreferences, DictationAudioArtifact, DictationRecordDraftV1, DictationRecordUpdateV1,
    DictationRecordV1, ExportedDictationAudio, LocalDictationRecordStore, LocalSettingsStore,
    MicrophoneSelection, OnboardingState, SavedDictationAudio, SystemSettings,
    VoiceCapsulePlacement,
};
use crate::windowing;
use crate::windowing::{VoiceCapsuleSizeMode, VoiceCapsuleSizeModeResult};
use serde::Serialize;
use std::sync::Arc;
use tauri::{ipc::Channel, AppHandle, Emitter, Manager, State, WebviewWindow};

const SPEECH_PROVIDER_CHANGED_EVENT: &str = "vaak://speech-provider-changed";
const SYSTEM_SETTINGS_CHANGED_EVENT: &str = "vaak://system-settings-changed";
const ONBOARDING_COMPLETED_EVENT: &str = "vaak://onboarding-completed";
const MICROPHONE_SELECTION_CHANGED_EVENT: &str = "vaak://microphone-selection-changed";
const MAX_RECENT_RECORD_LIMIT: usize = 200;
const MAX_RECENT_RECORD_OFFSET: usize = 10_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum CommandWindowPolicy {
    CapsuleAllowed,
    MainOnly,
}

fn command_window_policy(command: &str) -> Option<CommandWindowPolicy> {
    match command {
        "record_startup_checkpoint"
        | "record_renderer_heartbeat"
        | "record_renderer_error"
        | "get_voice_capsule_ready_challenge"
        | "record_voice_capsule_ready"
        | "capture_dictation_target"
        | "insert_into_active_target"
        | "get_hotkey_bindings"
        | "save_dictation_record"
        | "persist_dictation_audio"
        | "get_selected_speech_provider"
        | "start_assemblyai_streaming_session"
        | "send_assemblyai_streaming_audio"
        | "stop_assemblyai_streaming_session"
        | "cleanup_assemblyai_streaming_sessions"
        | "get_onboarding_state"
        | "get_voice_capsule_placement"
        | "save_voice_capsule_placement"
        | "set_voice_capsule_size_mode"
        | "open_main_window"
        | "get_microphone_selection"
        | "transcribe_recording" => Some(CommandWindowPolicy::CapsuleAllowed),
        "get_diagnostics_locations"
        | "get_focused_field"
        | "insert_text"
        | "capture_and_insert"
        | "get_accessibility_permission_status"
        | "get_input_monitoring_permission_status"
        | "save_dictation_hotkey"
        | "update_dictation_record"
        | "get_recent_dictation_records"
        | "load_saved_dictation_audio"
        | "export_saved_dictation_audio"
        | "save_provider_key"
        | "save_provider_config"
        | "save_speech_provider_setup"
        | "get_provider_config"
        | "save_selected_speech_provider"
        | "get_provider_status"
        | "test_speech_provider"
        | "get_app_shell_preferences"
        | "save_app_shell_preferences"
        | "get_system_settings"
        | "save_system_settings"
        | "save_microphone_selection"
        | "save_onboarding_mode"
        | "save_onboarding_step"
        | "complete_onboarding"
        | "restart_voice_capsule"
        | "reset_voice_capsule_position"
        | "disable_voice_capsule"
        | "enable_voice_capsule" => Some(CommandWindowPolicy::MainOnly),
        _ => None,
    }
}

fn ensure_command_allowed_for_window(
    command: &str,
    window_label: &str,
) -> Result<(), ProviderError> {
    match command_window_policy(command) {
        Some(CommandWindowPolicy::CapsuleAllowed) => Ok(()),
        Some(CommandWindowPolicy::MainOnly) if window_label == MAIN_WINDOW_LABEL => Ok(()),
        Some(CommandWindowPolicy::MainOnly) => Err(ProviderFailure::InvalidRequest(format!(
            "{command} is not available to the {window_label} window"
        ))
        .into()),
        None => Err(ProviderFailure::InvalidRequest(format!(
            "{command} does not have a window policy"
        ))
        .into()),
    }
}

fn ensure_platform_command_allowed(command: &str, window_label: &str) -> Result<(), PlatformError> {
    if ensure_command_allowed_for_window(command, window_label).is_ok() {
        return Ok(());
    }

    Err(PlatformError::new(
        "command_denied",
        format!("{command} is not available to the {window_label} window"),
    ))
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsLocations {
    pub log_dir: String,
    pub config_dir: String,
}

#[tauri::command]
pub fn get_focused_field(window: WebviewWindow) -> Result<FocusedFieldInfo, PlatformError> {
    ensure_platform_command_allowed("get_focused_field", window.label())?;
    platform::get_focused_field()
}

#[tauri::command]
pub fn record_startup_checkpoint(
    window_label: String,
    checkpoint: String,
    detail: Option<String>,
    diagnostics: State<'_, StartupDiagnostics>,
) {
    diagnostics.record_renderer_checkpoint(&window_label, &checkpoint, detail.as_deref());
}

#[tauri::command]
pub fn record_renderer_heartbeat(
    window_label: String,
    renderer_instance_id: Option<String>,
    health: State<'_, RendererHealth>,
    readiness: State<'_, VoiceCapsuleReadiness>,
    diagnostics: State<'_, StartupDiagnostics>,
) {
    let renderer_instance_id = renderer_instance_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let heartbeat_log = health.record_heartbeat(&window_label, renderer_instance_id);
    if window_label == VOICE_CAPSULE_LABEL {
        if let Some(renderer_instance_id) = renderer_instance_id {
            readiness.record_voice_capsule_heartbeat(renderer_instance_id);
        }
    }
    let Some(detail) = heartbeat_log.detail() else {
        return;
    };

    diagnostics.record_renderer_checkpoint(
        &window_label,
        "renderer_heartbeat_received",
        Some(&detail),
    );
}

#[tauri::command]
pub fn record_renderer_error(
    window_label: String,
    message: String,
    source: Option<String>,
    line: Option<u32>,
    column: Option<u32>,
    diagnostics: State<'_, StartupDiagnostics>,
) {
    diagnostics.record_renderer_checkpoint(
        &window_label,
        "renderer_error_reported",
        Some(&message),
    );
    log::error!(
        "renderer_error window={} message={} source={} line={:?} column={:?}",
        window_label,
        message,
        source.as_deref().unwrap_or("unknown"),
        line,
        column
    );
}

#[tauri::command]
pub fn get_voice_capsule_ready_challenge(
    window: WebviewWindow,
    renderer_instance_id: String,
    readiness: State<'_, VoiceCapsuleReadiness>,
    diagnostics: State<'_, StartupDiagnostics>,
) -> Result<VoiceCapsuleReadyChallenge, ProviderError> {
    if window.label() != VOICE_CAPSULE_LABEL {
        return Err(ProviderFailure::InvalidRequest(
            "voice capsule ready challenge is only available to the voice capsule".to_string(),
        )
        .into());
    }

    readiness
        .challenge(&renderer_instance_id)
        .map_err(|reason| {
            diagnostics
                .record_backend_checkpoint("voice_capsule_ready_challenge_failed", Some(reason));
            ProviderFailure::InvalidRequest(format!(
                "voice capsule ready challenge rejected: {reason}"
            ))
            .into()
        })
}

#[tauri::command]
pub fn record_voice_capsule_ready(
    window: WebviewWindow,
    run_id: String,
    attempt_id: String,
    nonce: String,
    renderer_instance_id: String,
    session_enabled: bool,
    readiness: State<'_, VoiceCapsuleReadiness>,
    diagnostics: State<'_, StartupDiagnostics>,
) -> Result<(), ProviderError> {
    match readiness.record_ready(VoiceCapsuleReadyInput {
        caller_label: window.label(),
        run_id: &run_id,
        attempt_id: &attempt_id,
        nonce: &nonce,
        renderer_instance_id: &renderer_instance_id,
        session_enabled,
    }) {
        VoiceCapsuleReadyAck::Accepted { detail } => {
            diagnostics
                .record_backend_checkpoint("voice_capsule_ready_ack_received", Some(&detail));
            Ok(())
        }
        VoiceCapsuleReadyAck::Rejected { reason } => {
            diagnostics.record_backend_checkpoint("voice_capsule_ready_ack_rejected", Some(reason));
            Err(ProviderFailure::InvalidRequest(format!(
                "voice capsule ready ack rejected: {reason}"
            ))
            .into())
        }
    }
}

#[tauri::command]
pub fn get_diagnostics_locations(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<DiagnosticsLocations, ProviderError> {
    ensure_command_allowed_for_window("get_diagnostics_locations", window.label())?;
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;

    std::fs::create_dir_all(&log_dir)
        .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
    std::fs::create_dir_all(&config_dir)
        .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;

    Ok(DiagnosticsLocations {
        log_dir: log_dir.to_string_lossy().to_string(),
        config_dir: config_dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn capture_dictation_target(
    session: State<'_, SessionStore>,
) -> Result<FocusedFieldInfo, PlatformError> {
    let field = platform::get_focused_field()?;
    session.set_dictation_target(field.clone());
    Ok(field)
}

#[tauri::command]
pub fn insert_text(window: WebviewWindow, text: String) -> Result<TextInsertResult, PlatformError> {
    ensure_platform_command_allowed("insert_text", window.label())?;
    platform::insert_text(&text)
}

#[tauri::command]
pub fn capture_and_insert(
    window: WebviewWindow,
    text: String,
) -> Result<CaptureInsertResult, PlatformError> {
    ensure_platform_command_allowed("capture_and_insert", window.label())?;
    platform::capture_and_insert(&text)
}

#[tauri::command]
pub fn get_accessibility_permission_status(
    window: WebviewWindow,
) -> Result<PermissionStatus, ProviderError> {
    ensure_command_allowed_for_window("get_accessibility_permission_status", window.label())?;
    Ok(platform::accessibility_permission_status())
}

#[tauri::command]
pub fn get_input_monitoring_permission_status(
    window: WebviewWindow,
) -> Result<PermissionStatus, ProviderError> {
    ensure_command_allowed_for_window("get_input_monitoring_permission_status", window.label())?;
    Ok(platform::input_monitoring_permission_status())
}

#[tauri::command]
pub fn insert_into_active_target(
    text: String,
    session: State<'_, SessionStore>,
) -> Result<TextInsertResult, PlatformError> {
    let captured = session.get_dictation_target().ok_or_else(|| {
        PlatformError::new("no_active_target", "No captured dictation target available")
    })?;
    platform::insert_text_for_captured_target(&text, &captured)
}

#[tauri::command]
pub fn get_hotkey_bindings(session: State<'_, SessionStore>) -> HotkeyBindings {
    session.hotkey_bindings()
}

#[tauri::command]
pub fn save_dictation_hotkey(
    window: WebviewWindow,
    shortcut: String,
    settings: State<'_, LocalSettingsStore>,
    session: State<'_, SessionStore>,
) -> Result<HotkeyBindings, ProviderError> {
    ensure_command_allowed_for_window("save_dictation_hotkey", window.label())?;
    let bindings = settings.save_dictation_hotkey(&shortcut)?;
    session
        .set_dictation_hotkey(&bindings.dictation)
        .map_err(ProviderFailure::InvalidRequest)?;
    Ok(bindings)
}

#[tauri::command]
pub fn save_dictation_record(
    draft: DictationRecordDraftV1,
    settings: State<'_, LocalSettingsStore>,
    records: State<'_, LocalDictationRecordStore>,
) -> Result<DictationRecordV1, ProviderError> {
    records.save(&settings, draft)
}

#[tauri::command]
pub fn update_dictation_record(
    window: WebviewWindow,
    record_id: String,
    patch: DictationRecordUpdateV1,
    records: State<'_, LocalDictationRecordStore>,
) -> Result<DictationRecordV1, ProviderError> {
    ensure_command_allowed_for_window("update_dictation_record", window.label())?;
    records.update(&record_id, patch)
}

#[tauri::command]
pub fn get_recent_dictation_records(
    window: WebviewWindow,
    limit: Option<usize>,
    offset: Option<usize>,
    records: State<'_, LocalDictationRecordStore>,
) -> Result<Vec<DictationRecordV1>, ProviderError> {
    ensure_command_allowed_for_window("get_recent_dictation_records", window.label())?;
    let limit = limit.unwrap_or(12);
    let offset = offset.unwrap_or(0);
    if limit == 0 || limit > MAX_RECENT_RECORD_LIMIT {
        return Err(ProviderFailure::InvalidRequest(format!(
            "record limit must be between 1 and {MAX_RECENT_RECORD_LIMIT}"
        ))
        .into());
    }
    if offset > MAX_RECENT_RECORD_OFFSET {
        return Err(ProviderFailure::InvalidRequest(format!(
            "record offset must be at most {MAX_RECENT_RECORD_OFFSET}"
        ))
        .into());
    }

    records.list_recent(limit, offset)
}

#[tauri::command]
pub fn persist_dictation_audio(
    audio_bytes: Vec<u8>,
    mime_type: String,
    captured_at: String,
    records: State<'_, LocalDictationRecordStore>,
) -> Result<DictationAudioArtifact, ProviderError> {
    let mime_type = crate::providers::normalize_audio_mime_type(&mime_type)?;
    records.persist_audio(audio_bytes, mime_type, &captured_at)
}

#[tauri::command]
pub fn load_saved_dictation_audio(
    window: WebviewWindow,
    relative_path: String,
    records: State<'_, LocalDictationRecordStore>,
) -> Result<SavedDictationAudio, ProviderError> {
    ensure_command_allowed_for_window("load_saved_dictation_audio", window.label())?;
    records.load_audio(&relative_path)
}

#[tauri::command]
pub fn export_saved_dictation_audio(
    window: WebviewWindow,
    relative_path: String,
    records: State<'_, LocalDictationRecordStore>,
) -> Result<ExportedDictationAudio, ProviderError> {
    ensure_command_allowed_for_window("export_saved_dictation_audio", window.label())?;
    let download_dir = dirs::download_dir().ok_or_else(|| {
        ProviderFailure::SettingsStore("downloads directory is not available".to_string())
    })?;

    records.export_audio_to_dir(&relative_path, download_dir)
}

#[tauri::command]
pub fn save_provider_key(
    window: WebviewWindow,
    provider_id: String,
    api_key: String,
    settings: State<'_, LocalSettingsStore>,
) -> Result<ProviderStatus, ProviderError> {
    ensure_command_allowed_for_window("save_provider_key", window.label())?;
    speech::validate_provider_id(&provider_id)?;
    credentials::save_provider_key(&provider_id, &api_key)?;
    speech::provider_status(&provider_id, &settings)
}

#[tauri::command]
pub fn save_provider_config(
    window: WebviewWindow,
    provider_id: String,
    config: ProviderConfig,
    settings: State<'_, LocalSettingsStore>,
) -> Result<ProviderStatus, ProviderError> {
    ensure_command_allowed_for_window("save_provider_config", window.label())?;
    speech::validate_provider_id(&provider_id)?;
    let config = crate::providers::normalize_provider_config(&provider_id, config)?;
    settings.save_provider_config(&provider_id, &config)?;
    speech::provider_status(&provider_id, &settings)
}

#[tauri::command]
pub fn save_speech_provider_setup(
    window: WebviewWindow,
    app: AppHandle,
    settings: State<'_, LocalSettingsStore>,
    provider_id: String,
    api_key: String,
    config: Option<ProviderConfig>,
    activate: bool,
) -> Result<ProviderStatus, ProviderError> {
    ensure_command_allowed_for_window("save_speech_provider_setup", window.label())?;
    speech::validate_provider_id(&provider_id)?;
    let api_key = api_key.trim();

    if let Some(config) = config {
        let config = crate::providers::normalize_provider_config(&provider_id, config)?;
        settings.save_provider_config(&provider_id, &config)?;
    }

    if !api_key.is_empty() {
        credentials::save_provider_key(&provider_id, api_key)?;
        if credentials::provider_key(&provider_id)?.trim().is_empty() {
            return Err(crate::providers::errors::ProviderFailure::MissingCredential.into());
        }
    }

    let has_saved_key = credentials::has_provider_key(&provider_id)?;
    if api_key.is_empty() && !has_saved_key {
        return Err(crate::providers::errors::ProviderFailure::InvalidRequest(
            "provider API key is required".to_string(),
        )
        .into());
    }

    let status = speech::provider_status(&provider_id, &settings)?;
    if !status.configured {
        return Err(crate::providers::errors::ProviderFailure::MissingCredential.into());
    }
    if !status.config_complete {
        return Err(crate::providers::errors::ProviderFailure::MissingConfiguration.into());
    }

    if activate {
        settings.save_selected_speech_provider(&provider_id)?;
        let _ = app.emit(SPEECH_PROVIDER_CHANGED_EVENT, provider_id);
    }

    Ok(status)
}

#[tauri::command]
pub fn get_provider_config(
    window: WebviewWindow,
    provider_id: String,
    settings: State<'_, LocalSettingsStore>,
) -> Result<Option<ProviderConfig>, ProviderError> {
    ensure_command_allowed_for_window("get_provider_config", window.label())?;
    speech::validate_provider_id(&provider_id)?;
    settings.provider_config_or_migrate(&provider_id, || {
        credentials::legacy_provider_config(&provider_id)
    })
}

#[tauri::command]
pub fn save_selected_speech_provider(
    window: WebviewWindow,
    app: AppHandle,
    settings: State<'_, LocalSettingsStore>,
    provider_id: String,
) -> Result<String, ProviderError> {
    ensure_command_allowed_for_window("save_selected_speech_provider", window.label())?;
    speech::validate_provider_id(&provider_id)?;
    settings.save_selected_speech_provider(&provider_id)?;
    let _ = app.emit(SPEECH_PROVIDER_CHANGED_EVENT, provider_id.clone());
    Ok(provider_id)
}

#[tauri::command]
pub fn get_selected_speech_provider(
    settings: State<'_, LocalSettingsStore>,
) -> Result<String, ProviderError> {
    let selected = settings
        .selected_speech_provider_or_migrate(credentials::legacy_selected_speech_provider)?;
    speech::validate_provider_id(&selected)?;
    Ok(selected)
}

#[tauri::command]
pub fn get_provider_status(
    window: WebviewWindow,
    provider_id: String,
    settings: State<'_, LocalSettingsStore>,
) -> Result<ProviderStatus, ProviderError> {
    ensure_command_allowed_for_window("get_provider_status", window.label())?;
    speech::provider_status(&provider_id, &settings)
}

#[tauri::command]
pub fn test_speech_provider(
    window: WebviewWindow,
    provider_id: String,
    settings: State<'_, LocalSettingsStore>,
) -> Result<ProviderStatus, ProviderError> {
    ensure_command_allowed_for_window("test_speech_provider", window.label())?;
    speech::validate_provider_id(&provider_id)?;
    let status = speech::provider_status(&provider_id, &settings)?;
    ensure_provider_ready(status)
}

#[tauri::command]
pub fn get_onboarding_state(
    settings: State<'_, LocalSettingsStore>,
) -> Result<OnboardingState, ProviderError> {
    settings.onboarding_state()
}

#[tauri::command]
pub fn get_app_shell_preferences(
    window: WebviewWindow,
    settings: State<'_, LocalSettingsStore>,
) -> Result<AppShellPreferences, ProviderError> {
    ensure_command_allowed_for_window("get_app_shell_preferences", window.label())?;
    settings.app_shell_preferences()
}

#[tauri::command]
pub fn save_app_shell_preferences(
    window: WebviewWindow,
    settings: State<'_, LocalSettingsStore>,
    preferences: AppShellPreferences,
) -> Result<AppShellPreferences, ProviderError> {
    ensure_command_allowed_for_window("save_app_shell_preferences", window.label())?;
    settings.save_app_shell_preferences(preferences)
}

#[tauri::command]
pub fn get_system_settings(
    window: WebviewWindow,
    settings: State<'_, LocalSettingsStore>,
) -> Result<SystemSettings, ProviderError> {
    ensure_command_allowed_for_window("get_system_settings", window.label())?;
    settings.system_settings()
}

#[tauri::command]
pub fn save_system_settings(
    window: WebviewWindow,
    app: AppHandle,
    local_settings: State<'_, LocalSettingsStore>,
    settings: SystemSettings,
) -> Result<SystemSettings, ProviderError> {
    ensure_command_allowed_for_window("save_system_settings", window.label())?;
    apply_startup_launch_setting(&app, settings.launch_on_startup)?;
    let saved_settings = local_settings.save_system_settings(settings)?;
    app.emit(SYSTEM_SETTINGS_CHANGED_EVENT, saved_settings.clone())
        .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
    Ok(saved_settings)
}

#[tauri::command]
pub fn get_voice_capsule_placement(
    settings: State<'_, LocalSettingsStore>,
) -> Result<VoiceCapsulePlacement, ProviderError> {
    Ok(settings
        .app_shell_preferences()?
        .voice_capsule_placement
        .unwrap_or_default())
}

#[tauri::command]
pub fn save_voice_capsule_placement(
    app: AppHandle,
    settings: State<'_, LocalSettingsStore>,
    placement: VoiceCapsulePlacement,
) -> Result<VoiceCapsulePlacement, ProviderError> {
    let placement = if let Some(voice_capsule) = app.get_webview_window("voice-capsule") {
        windowing::placement_with_current_monitor_metadata(&voice_capsule, placement)
            .map_err(ProviderFailure::SettingsStore)?
    } else {
        placement
    };
    let mut preferences = settings.app_shell_preferences()?;
    preferences.voice_capsule_placement = Some(placement.clone());
    settings.save_app_shell_preferences(preferences)?;

    if let Some(voice_capsule) = app.get_webview_window("voice-capsule") {
        windowing::apply_voice_capsule_placement(&voice_capsule, Some(&placement))
            .map_err(ProviderFailure::SettingsStore)?;
    }

    Ok(placement)
}

#[tauri::command]
pub fn restart_voice_capsule(
    window: WebviewWindow,
    app: AppHandle,
    settings: State<'_, LocalSettingsStore>,
    readiness: State<'_, VoiceCapsuleReadiness>,
    health: State<'_, RendererHealth>,
    diagnostics: State<'_, StartupDiagnostics>,
) -> Result<(), ProviderError> {
    ensure_command_allowed_for_window("restart_voice_capsule", window.label())?;
    restart_voice_capsule_for_app(
        &app,
        settings.inner(),
        readiness.inner(),
        health.inner(),
        diagnostics.inner(),
    )
}

#[tauri::command]
pub fn reset_voice_capsule_position(
    window: WebviewWindow,
    app: AppHandle,
    settings: State<'_, LocalSettingsStore>,
    diagnostics: State<'_, StartupDiagnostics>,
) -> Result<VoiceCapsulePlacement, ProviderError> {
    ensure_command_allowed_for_window("reset_voice_capsule_position", window.label())?;
    reset_voice_capsule_position_for_app(&app, settings.inner(), diagnostics.inner())
}

#[tauri::command]
pub fn disable_voice_capsule(
    window: WebviewWindow,
    app: AppHandle,
    settings: State<'_, LocalSettingsStore>,
    readiness: State<'_, VoiceCapsuleReadiness>,
    diagnostics: State<'_, StartupDiagnostics>,
) -> Result<AppShellPreferences, ProviderError> {
    ensure_command_allowed_for_window("disable_voice_capsule", window.label())?;
    disable_voice_capsule_for_app(
        &app,
        settings.inner(),
        readiness.inner(),
        diagnostics.inner(),
    )
}

#[tauri::command]
pub fn enable_voice_capsule(
    window: WebviewWindow,
    app: AppHandle,
    settings: State<'_, LocalSettingsStore>,
    readiness: State<'_, VoiceCapsuleReadiness>,
    diagnostics: State<'_, StartupDiagnostics>,
) -> Result<AppShellPreferences, ProviderError> {
    ensure_command_allowed_for_window("enable_voice_capsule", window.label())?;
    enable_voice_capsule_for_app(
        &app,
        settings.inner(),
        readiness.inner(),
        diagnostics.inner(),
    )
}

#[tauri::command]
pub fn set_voice_capsule_size_mode(
    window: WebviewWindow,
    app: AppHandle,
    mode: VoiceCapsuleSizeMode,
) -> Result<VoiceCapsuleSizeModeResult, ProviderError> {
    ensure_command_allowed_for_window("set_voice_capsule_size_mode", window.label())?;
    let Some(voice_capsule) = app.get_webview_window(VOICE_CAPSULE_LABEL) else {
        return Ok(VoiceCapsuleSizeModeResult {
            popup_placement: windowing::VoiceCapsulePopupPlacement::Below,
            popup_horizontal_placement: windowing::VoiceCapsulePopupHorizontalPlacement::Left,
        });
    };
    Ok(windowing::set_voice_capsule_size_mode(&voice_capsule, mode)
        .map_err(ProviderFailure::SettingsStore)?)
}

#[tauri::command]
pub fn open_main_window(window: WebviewWindow, app: AppHandle) -> Result<(), ProviderError> {
    ensure_command_allowed_for_window("open_main_window", window.label())?;
    let Some(main_window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Err(ProviderFailure::SettingsStore("main window was not found".to_string()).into());
    };

    main_window
        .show()
        .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
    main_window
        .unminimize()
        .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
    main_window
        .set_focus()
        .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
    Ok(())
}

pub fn restart_voice_capsule_for_app<R: tauri::Runtime>(
    app: &AppHandle<R>,
    settings: &LocalSettingsStore,
    readiness: &VoiceCapsuleReadiness,
    health: &RendererHealth,
    diagnostics: &StartupDiagnostics,
) -> Result<(), ProviderError> {
    settings.save_voice_capsule_enabled(true)?;
    readiness.enable_by_user();
    diagnostics.record_backend_checkpoint("voice_capsule_restart_requested", None);
    show_voice_capsule_for_completed_user(app, settings)?;
    let attempt = readiness.begin_recovery_attempt(
        "user_restart",
        health.latest_voice_capsule_renderer_instance_id(),
    );
    diagnostics.record_backend_checkpoint(
        "voice_capsule_recovery_started",
        Some(&attempt.detail("user_restart")),
    );
    if let Some(voice_capsule) = app.get_webview_window(VOICE_CAPSULE_LABEL) {
        voice_capsule
            .eval("window.location.reload()")
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
    }
    Ok(())
}

pub fn reset_voice_capsule_position_for_app<R: tauri::Runtime>(
    app: &AppHandle<R>,
    settings: &LocalSettingsStore,
    diagnostics: &StartupDiagnostics,
) -> Result<VoiceCapsulePlacement, ProviderError> {
    let placement = VoiceCapsulePlacement::default();
    let placement = if let Some(voice_capsule) = app.get_webview_window(VOICE_CAPSULE_LABEL) {
        let placement =
            windowing::placement_with_current_monitor_metadata(&voice_capsule, placement)
                .map_err(ProviderFailure::SettingsStore)?;
        windowing::apply_voice_capsule_placement(&voice_capsule, Some(&placement))
            .map_err(ProviderFailure::SettingsStore)?;
        placement
    } else {
        placement
    };
    let mut preferences = settings.app_shell_preferences()?;
    preferences.voice_capsule_placement = Some(placement.clone());
    settings.save_app_shell_preferences(preferences)?;
    diagnostics.record_backend_checkpoint("voice_capsule_position_reset", None);
    Ok(placement)
}

pub fn disable_voice_capsule_for_app<R: tauri::Runtime>(
    app: &AppHandle<R>,
    settings: &LocalSettingsStore,
    readiness: &VoiceCapsuleReadiness,
    diagnostics: &StartupDiagnostics,
) -> Result<AppShellPreferences, ProviderError> {
    let preferences = settings.save_voice_capsule_enabled(false)?;
    readiness.disable_by_user();
    if let Some(voice_capsule) = app.get_webview_window(VOICE_CAPSULE_LABEL) {
        voice_capsule
            .hide()
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
    }
    diagnostics.record_backend_checkpoint("voice_capsule_disabled_by_user", None);
    Ok(preferences)
}

pub fn enable_voice_capsule_for_app<R: tauri::Runtime>(
    app: &AppHandle<R>,
    settings: &LocalSettingsStore,
    readiness: &VoiceCapsuleReadiness,
    diagnostics: &StartupDiagnostics,
) -> Result<AppShellPreferences, ProviderError> {
    let preferences = settings.save_voice_capsule_enabled(true)?;
    readiness.enable_by_user();
    show_voice_capsule_for_completed_user(app, settings)?;
    diagnostics.record_backend_checkpoint("voice_capsule_enabled_by_user", None);
    Ok(preferences)
}

fn show_voice_capsule_for_completed_user<R: tauri::Runtime>(
    app: &AppHandle<R>,
    settings: &LocalSettingsStore,
) -> Result<(), ProviderError> {
    if !settings.onboarding_state()?.completed {
        return Ok(());
    }
    let preferences = settings.app_shell_preferences()?;
    if !preferences.voice_capsule_enabled {
        return Ok(());
    }
    let Some(voice_capsule) = app.get_webview_window(VOICE_CAPSULE_LABEL) else {
        return Ok(());
    };
    windowing::prepare_voice_capsule_window(
        &voice_capsule,
        preferences.voice_capsule_placement.as_ref(),
    )
    .map_err(ProviderFailure::SettingsStore)?;
    windowing::show_voice_capsule_window(&voice_capsule).map_err(ProviderFailure::SettingsStore)?;
    Ok(())
}

#[tauri::command]
pub fn get_microphone_selection(
    settings: State<'_, LocalSettingsStore>,
) -> Result<MicrophoneSelection, ProviderError> {
    settings.microphone_selection()
}

#[tauri::command]
pub fn save_microphone_selection(
    window: WebviewWindow,
    app: AppHandle,
    settings: State<'_, LocalSettingsStore>,
    selection: MicrophoneSelection,
) -> Result<MicrophoneSelection, ProviderError> {
    ensure_command_allowed_for_window("save_microphone_selection", window.label())?;
    let saved_selection = settings.save_microphone_selection(selection)?;
    let _ = app.emit(MICROPHONE_SELECTION_CHANGED_EVENT, saved_selection.clone());
    Ok(saved_selection)
}

#[tauri::command]
pub fn save_onboarding_mode(
    window: WebviewWindow,
    settings: State<'_, LocalSettingsStore>,
    mode: String,
) -> Result<OnboardingState, ProviderError> {
    ensure_command_allowed_for_window("save_onboarding_mode", window.label())?;
    settings.save_onboarding_mode(&mode)
}

#[tauri::command]
pub fn save_onboarding_step(
    window: WebviewWindow,
    settings: State<'_, LocalSettingsStore>,
    step: String,
) -> Result<OnboardingState, ProviderError> {
    ensure_command_allowed_for_window("save_onboarding_step", window.label())?;
    settings.save_onboarding_step(&step)
}

#[tauri::command]
pub fn complete_onboarding(
    window: WebviewWindow,
    app: AppHandle,
    settings: State<'_, LocalSettingsStore>,
) -> Result<OnboardingState, ProviderError> {
    ensure_command_allowed_for_window("complete_onboarding", window.label())?;
    let saved_state = settings.complete_onboarding()?;
    let _ = app.emit(ONBOARDING_COMPLETED_EVENT, saved_state.clone());
    if let Some(voice_capsule) = app.get_webview_window("voice-capsule") {
        let preferences = settings.app_shell_preferences()?;
        if !preferences.voice_capsule_enabled {
            return Ok(saved_state);
        }
        windowing::prepare_voice_capsule_window(
            &voice_capsule,
            preferences.voice_capsule_placement.as_ref(),
        )
        .map_err(ProviderFailure::SettingsStore)?;
        windowing::show_voice_capsule_window(&voice_capsule)
            .map_err(ProviderFailure::SettingsStore)?;
    }
    Ok(saved_state)
}

#[tauri::command]
pub async fn transcribe_recording(
    provider_id: String,
    audio_bytes: Vec<u8>,
    mime_type: String,
    language: Option<String>,
    prompt: Option<String>,
    model: Option<String>,
    settings: State<'_, LocalSettingsStore>,
) -> Result<TranscriptResult, ProviderError> {
    speech::validate_provider_id(&provider_id)?;
    speech::transcribe(
        &provider_id,
        TranscriptionInput {
            audio: audio_bytes,
            mime_type,
            language,
            prompt,
            model,
        },
        &settings,
    )
    .await
}

#[tauri::command]
pub async fn start_assemblyai_streaming_session(
    window: WebviewWindow,
    events: Channel<AssemblyAiStreamingCommandEvent>,
    streaming: State<'_, Arc<ManagedAssemblyAiStreamingState>>,
) -> Result<AssemblyAiStreamingStartResult, ProviderError> {
    ensure_command_allowed_for_window("start_assemblyai_streaming_session", window.label())?;
    let api_key = credentials::provider_key("assemblyai")?;
    assemblyai_streaming::start_managed_session(&api_key, Arc::clone(streaming.inner()), events)
        .await
}

#[tauri::command]
pub fn send_assemblyai_streaming_audio(
    window: WebviewWindow,
    audio_bytes: Vec<u8>,
    streaming: State<'_, Arc<ManagedAssemblyAiStreamingState>>,
) -> Result<StreamingAudioWrite, ProviderError> {
    ensure_command_allowed_for_window("send_assemblyai_streaming_audio", window.label())?;
    streaming.send_pcm16(audio_bytes)
}

#[tauri::command]
pub fn stop_assemblyai_streaming_session(
    window: WebviewWindow,
    streaming: State<'_, Arc<ManagedAssemblyAiStreamingState>>,
) -> Result<bool, ProviderError> {
    ensure_command_allowed_for_window("stop_assemblyai_streaming_session", window.label())?;
    Ok(streaming.request_stop())
}

#[tauri::command]
pub fn cleanup_assemblyai_streaming_sessions(
    window: WebviewWindow,
    streaming: State<'_, Arc<ManagedAssemblyAiStreamingState>>,
) -> Result<bool, ProviderError> {
    ensure_command_allowed_for_window("cleanup_assemblyai_streaming_sessions", window.label())?;
    let stopped = streaming.request_stop();
    let _ = streaming.take_active();
    Ok(stopped)
}

fn ensure_provider_ready(status: ProviderStatus) -> Result<ProviderStatus, ProviderError> {
    if !status.configured {
        return Err(crate::providers::errors::ProviderFailure::MissingCredential.into());
    }
    if !status.config_complete {
        return Err(crate::providers::errors::ProviderFailure::MissingConfiguration.into());
    }
    Ok(status)
}

fn apply_startup_launch_setting(
    app: &AppHandle,
    launch_on_startup: bool,
) -> Result<(), ProviderError> {
    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::ManagerExt;

        let autostart_manager = app.autolaunch();
        if launch_on_startup {
            autostart_manager
                .enable()
                .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        } else {
            autostart_manager
                .disable()
                .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        }
    }

    #[cfg(not(desktop))]
    {
        let _ = (app, launch_on_startup);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_policy_denies_sensitive_commands_from_voice_capsule() {
        for command in [
            "save_provider_key",
            "save_provider_config",
            "save_speech_provider_setup",
            "save_selected_speech_provider",
            "test_speech_provider",
            "export_saved_dictation_audio",
            "load_saved_dictation_audio",
            "get_recent_dictation_records",
            "update_dictation_record",
            "save_onboarding_mode",
            "save_onboarding_step",
            "complete_onboarding",
            "save_system_settings",
            "save_app_shell_preferences",
            "save_microphone_selection",
            "save_dictation_hotkey",
            "get_diagnostics_locations",
            "insert_text",
            "capture_and_insert",
            "restart_voice_capsule",
            "reset_voice_capsule_position",
            "disable_voice_capsule",
            "enable_voice_capsule",
        ] {
            let err = ensure_command_allowed_for_window(command, VOICE_CAPSULE_LABEL).unwrap_err();
            assert_eq!(err.code, "invalid_provider_request", "{command}");
        }
    }

    #[test]
    fn command_policy_allows_capsule_workflow_commands() {
        for command in [
            "get_onboarding_state",
            "get_voice_capsule_ready_challenge",
            "record_voice_capsule_ready",
            "record_renderer_heartbeat",
            "record_renderer_error",
            "record_startup_checkpoint",
            "capture_dictation_target",
            "insert_into_active_target",
            "get_selected_speech_provider",
            "transcribe_recording",
            "start_assemblyai_streaming_session",
            "send_assemblyai_streaming_audio",
            "stop_assemblyai_streaming_session",
            "cleanup_assemblyai_streaming_sessions",
            "persist_dictation_audio",
            "save_dictation_record",
            "save_voice_capsule_placement",
            "set_voice_capsule_size_mode",
            "open_main_window",
        ] {
            assert!(
                ensure_command_allowed_for_window(command, VOICE_CAPSULE_LABEL).is_ok(),
                "{command}"
            );
        }
    }

    #[test]
    fn every_registered_tauri_command_has_an_explicit_window_policy() {
        let commands = registered_tauri_command_names();
        assert!(!commands.is_empty());

        for command in commands {
            assert!(
                command_window_policy(command).is_some(),
                "{command} is missing a window policy"
            );
        }
    }

    fn status(configured: bool, config_complete: bool) -> ProviderStatus {
        ProviderStatus {
            provider_id: "azure-openai".to_string(),
            configured,
            config_complete,
        }
    }

    #[test]
    fn provider_test_requires_saved_key() {
        let err = ensure_provider_ready(status(false, true)).unwrap_err();

        assert_eq!(err.code, "missing_provider_key");
    }

    #[test]
    fn provider_test_requires_complete_config() {
        let err = ensure_provider_ready(status(true, false)).unwrap_err();

        assert_eq!(err.code, "missing_provider_config");
    }

    #[test]
    fn provider_test_returns_ready_status() {
        let ready = ensure_provider_ready(status(true, true)).unwrap();

        assert!(ready.configured);
        assert!(ready.config_complete);
    }

    fn registered_tauri_command_names() -> Vec<&'static str> {
        let mut commands = Vec::new();
        let mut previous_line_was_command_attr = false;

        for line in include_str!("mod.rs").lines() {
            let trimmed = line.trim();
            if trimmed == "#[tauri::command]" {
                previous_line_was_command_attr = true;
                continue;
            }
            if previous_line_was_command_attr {
                previous_line_was_command_attr = false;
                if let Some(rest) = trimmed.strip_prefix("pub fn ") {
                    if let Some((name, _)) = rest.split_once('(') {
                        commands.push(name);
                    }
                } else if let Some(rest) = trimmed.strip_prefix("pub async fn ") {
                    if let Some((name, _)) = rest.split_once('(') {
                        commands.push(name);
                    }
                }
            }
        }

        commands
    }
}
