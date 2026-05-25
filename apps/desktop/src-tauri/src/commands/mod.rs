use crate::platform;
use crate::platform::common::{
    CaptureInsertResult, FocusedFieldInfo, PermissionStatus, PlatformError, TextInsertResult,
};
use crate::providers::credentials;
use crate::providers::errors::{ProviderError, ProviderFailure};
use crate::providers::{
    speech, ProviderConfig, ProviderStatus, TranscriptResult, TranscriptionInput,
};
use crate::session::{HotkeyBindings, SessionStore};
use crate::storage::{
    AppShellPreferences, DictationAudioArtifact, DictationRecordDraftV1, DictationRecordUpdateV1,
    DictationRecordV1, ExportedDictationAudio, LocalDictationRecordStore, LocalSettingsStore,
    MicrophoneSelection, OnboardingState, SavedDictationAudio, SystemSettings,
    VoiceCapsulePlacement,
};
use crate::windowing;
use tauri::{AppHandle, Emitter, Manager, State};

const SPEECH_PROVIDER_CHANGED_EVENT: &str = "vaak://speech-provider-changed";
const ONBOARDING_COMPLETED_EVENT: &str = "vaak://onboarding-completed";
const MICROPHONE_SELECTION_CHANGED_EVENT: &str = "vaak://microphone-selection-changed";
const MAX_RECENT_RECORD_LIMIT: usize = 200;
const MAX_RECENT_RECORD_OFFSET: usize = 10_000;

#[tauri::command]
pub fn get_focused_field() -> Result<FocusedFieldInfo, PlatformError> {
    platform::get_focused_field()
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
pub fn insert_text(text: String) -> Result<TextInsertResult, PlatformError> {
    platform::insert_text(&text)
}

#[tauri::command]
pub fn capture_and_insert(text: String) -> Result<CaptureInsertResult, PlatformError> {
    platform::capture_and_insert(&text)
}

#[tauri::command]
pub fn get_accessibility_permission_status() -> PermissionStatus {
    platform::accessibility_permission_status()
}

#[tauri::command]
pub fn get_input_monitoring_permission_status() -> PermissionStatus {
    platform::input_monitoring_permission_status()
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
    shortcut: String,
    settings: State<'_, LocalSettingsStore>,
    session: State<'_, SessionStore>,
) -> Result<HotkeyBindings, ProviderError> {
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
    record_id: String,
    patch: DictationRecordUpdateV1,
    records: State<'_, LocalDictationRecordStore>,
) -> Result<DictationRecordV1, ProviderError> {
    records.update(&record_id, patch)
}

#[tauri::command]
pub fn get_recent_dictation_records(
    limit: Option<usize>,
    offset: Option<usize>,
    records: State<'_, LocalDictationRecordStore>,
) -> Result<Vec<DictationRecordV1>, ProviderError> {
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
    relative_path: String,
    records: State<'_, LocalDictationRecordStore>,
) -> Result<SavedDictationAudio, ProviderError> {
    records.load_audio(&relative_path)
}

#[tauri::command]
pub fn export_saved_dictation_audio(
    relative_path: String,
    records: State<'_, LocalDictationRecordStore>,
) -> Result<ExportedDictationAudio, ProviderError> {
    let download_dir = dirs::download_dir().ok_or_else(|| {
        ProviderFailure::SettingsStore("downloads directory is not available".to_string())
    })?;

    records.export_audio_to_dir(&relative_path, download_dir)
}

#[tauri::command]
pub fn save_provider_key(
    provider_id: String,
    api_key: String,
    settings: State<'_, LocalSettingsStore>,
) -> Result<ProviderStatus, ProviderError> {
    speech::validate_provider_id(&provider_id)?;
    credentials::save_provider_key(&provider_id, &api_key)?;
    speech::provider_status(&provider_id, &settings)
}

#[tauri::command]
pub fn save_provider_config(
    provider_id: String,
    config: ProviderConfig,
    settings: State<'_, LocalSettingsStore>,
) -> Result<ProviderStatus, ProviderError> {
    speech::validate_provider_id(&provider_id)?;
    let config = crate::providers::normalize_provider_config(&provider_id, config)?;
    settings.save_provider_config(&provider_id, &config)?;
    speech::provider_status(&provider_id, &settings)
}

#[tauri::command]
pub fn save_speech_provider_setup(
    app: AppHandle,
    settings: State<'_, LocalSettingsStore>,
    provider_id: String,
    api_key: String,
    config: Option<ProviderConfig>,
    activate: bool,
) -> Result<ProviderStatus, ProviderError> {
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
    provider_id: String,
    settings: State<'_, LocalSettingsStore>,
) -> Result<Option<ProviderConfig>, ProviderError> {
    speech::validate_provider_id(&provider_id)?;
    settings.provider_config_or_migrate(&provider_id, || {
        credentials::legacy_provider_config(&provider_id)
    })
}

#[tauri::command]
pub fn save_selected_speech_provider(
    app: AppHandle,
    settings: State<'_, LocalSettingsStore>,
    provider_id: String,
) -> Result<String, ProviderError> {
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
    provider_id: String,
    settings: State<'_, LocalSettingsStore>,
) -> Result<ProviderStatus, ProviderError> {
    speech::provider_status(&provider_id, &settings)
}

#[tauri::command]
pub fn test_speech_provider(
    provider_id: String,
    settings: State<'_, LocalSettingsStore>,
) -> Result<ProviderStatus, ProviderError> {
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
    settings: State<'_, LocalSettingsStore>,
) -> Result<AppShellPreferences, ProviderError> {
    settings.app_shell_preferences()
}

#[tauri::command]
pub fn save_app_shell_preferences(
    settings: State<'_, LocalSettingsStore>,
    preferences: AppShellPreferences,
) -> Result<AppShellPreferences, ProviderError> {
    settings.save_app_shell_preferences(preferences)
}

#[tauri::command]
pub fn get_system_settings(
    settings: State<'_, LocalSettingsStore>,
) -> Result<SystemSettings, ProviderError> {
    settings.system_settings()
}

#[tauri::command]
pub fn save_system_settings(
    app: AppHandle,
    local_settings: State<'_, LocalSettingsStore>,
    settings: SystemSettings,
) -> Result<SystemSettings, ProviderError> {
    apply_startup_launch_setting(&app, settings.launch_on_startup)?;
    local_settings.save_system_settings(settings)
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
pub fn get_microphone_selection(
    settings: State<'_, LocalSettingsStore>,
) -> Result<MicrophoneSelection, ProviderError> {
    settings.microphone_selection()
}

#[tauri::command]
pub fn save_microphone_selection(
    app: AppHandle,
    settings: State<'_, LocalSettingsStore>,
    selection: MicrophoneSelection,
) -> Result<MicrophoneSelection, ProviderError> {
    let saved_selection = settings.save_microphone_selection(selection)?;
    let _ = app.emit(MICROPHONE_SELECTION_CHANGED_EVENT, saved_selection.clone());
    Ok(saved_selection)
}

#[tauri::command]
pub fn save_onboarding_mode(
    settings: State<'_, LocalSettingsStore>,
    mode: String,
) -> Result<OnboardingState, ProviderError> {
    settings.save_onboarding_mode(&mode)
}

#[tauri::command]
pub fn save_onboarding_step(
    settings: State<'_, LocalSettingsStore>,
    step: String,
) -> Result<OnboardingState, ProviderError> {
    settings.save_onboarding_step(&step)
}

#[tauri::command]
pub fn complete_onboarding(
    app: AppHandle,
    settings: State<'_, LocalSettingsStore>,
) -> Result<OnboardingState, ProviderError> {
    let saved_state = settings.complete_onboarding()?;
    let _ = app.emit(ONBOARDING_COMPLETED_EVENT, saved_state.clone());
    if let Some(voice_capsule) = app.get_webview_window("voice-capsule") {
        let preferences = settings.app_shell_preferences()?;
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
}
