use crate::platform;
use crate::platform::common::{
    CaptureInsertResult, FocusedFieldInfo, PlatformError, TextInsertResult,
};
use crate::providers::credentials;
use crate::providers::errors::{ProviderError, ProviderFailure};
use crate::providers::{
    speech, ProviderConfig, ProviderStatus, TranscriptResult, TranscriptionInput,
};
use crate::session::{HotkeyBindings, SessionStore};
use crate::storage::{
    AppShellPreferences, DictationRecordDraftV1, DictationRecordV1, LocalDictationRecordStore,
    LocalSettingsStore, MicrophoneSelection, OnboardingState,
};
use crate::windowing;
use tauri::{AppHandle, Emitter, Manager, State};

const SPEECH_PROVIDER_CHANGED_EVENT: &str = "vaak://speech-provider-changed";

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
pub fn get_recent_dictation_records(
    limit: Option<usize>,
    records: State<'_, LocalDictationRecordStore>,
) -> Result<Vec<DictationRecordV1>, ProviderError> {
    records.list_recent(limit.unwrap_or(12))
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
pub fn get_microphone_selection(
    settings: State<'_, LocalSettingsStore>,
) -> Result<MicrophoneSelection, ProviderError> {
    settings.microphone_selection()
}

#[tauri::command]
pub fn save_microphone_selection(
    settings: State<'_, LocalSettingsStore>,
    selection: MicrophoneSelection,
) -> Result<MicrophoneSelection, ProviderError> {
    settings.save_microphone_selection(selection)
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
    if let Some(voice_capsule) = app.get_webview_window("voice-capsule") {
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
