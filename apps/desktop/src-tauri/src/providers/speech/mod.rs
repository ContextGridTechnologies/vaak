use async_trait::async_trait;

use crate::providers::credentials;
use crate::providers::errors::{ProviderError, ProviderFailure};
use crate::providers::{ProviderStatus, TranscriptResult, TranscriptionInput};
use crate::storage::LocalSettingsStore;

mod azure;
mod elevenlabs;
mod gemini;
mod openai;
mod prompts;

#[async_trait]
pub trait SpeechProvider {
    async fn transcribe(
        &self,
        api_key: String,
        input: TranscriptionInput,
    ) -> Result<TranscriptResult, ProviderError>;
}

pub fn provider_status(
    provider_id: &str,
    settings: &LocalSettingsStore,
) -> Result<ProviderStatus, ProviderError> {
    validate_provider_id(provider_id)?;
    Ok(ProviderStatus {
        provider_id: provider_id.to_string(),
        configured: credentials::has_provider_key(provider_id)?,
        config_complete: is_config_complete(provider_id, settings)?,
    })
}

pub async fn transcribe(
    provider_id: &str,
    input: TranscriptionInput,
    settings: &LocalSettingsStore,
) -> Result<TranscriptResult, ProviderError> {
    let api_key = credentials::provider_key(provider_id)?;
    let provider_config =
        settings.provider_config_or_migrate(provider_id, || credentials::legacy_provider_config(provider_id))?;
    let input = resolve_transcription_input(provider_id, input, provider_config.clone());

    match provider_id {
        openai::PROVIDER_ID => {
            openai::OpenAiSpeechProvider::default()
                .transcribe(api_key, input)
                .await
        }
        azure::PROVIDER_ID => {
            azure::AzureOpenAiSpeechProvider::new(
                provider_config
                    .ok_or_else(|| ProviderFailure::MissingConfiguration)?,
            )?
            .transcribe(api_key, input)
            .await
        }
        elevenlabs::PROVIDER_ID => {
            elevenlabs::ElevenLabsSpeechProvider::default()
                .transcribe(api_key, input)
                .await
        }
        gemini::PROVIDER_ID => Err(ProviderFailure::UnsupportedProvider.into()),
        _ => Err(ProviderFailure::UnsupportedProvider.into()),
    }
}

pub fn validate_provider_id(provider_id: &str) -> Result<(), ProviderError> {
    match provider_id {
        openai::PROVIDER_ID
        | azure::PROVIDER_ID
        | gemini::PROVIDER_ID
        | elevenlabs::PROVIDER_ID => Ok(()),
        _ => Err(ProviderFailure::UnsupportedProvider.into()),
    }
}

fn is_config_complete(
    provider_id: &str,
    settings: &LocalSettingsStore,
) -> Result<bool, ProviderError> {
    if provider_id == openai::PROVIDER_ID {
        return Ok(true);
    }

    if provider_id == azure::PROVIDER_ID {
        return Ok(settings
            .provider_config_or_migrate(provider_id, || {
                credentials::legacy_provider_config(provider_id)
            })?
            .map(|config| azure::AzureOpenAiSpeechProvider::config_complete(&config))
            .unwrap_or(false));
    }

    if provider_id == elevenlabs::PROVIDER_ID {
        return Ok(true);
    }

    Ok(false)
}

fn resolve_transcription_input(
    provider_id: &str,
    mut input: TranscriptionInput,
    config: Option<crate::providers::ProviderConfig>,
) -> TranscriptionInput {
    let has_explicit_model = input
        .model
        .as_deref()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);

    let supports_saved_model =
        provider_id == openai::PROVIDER_ID || provider_id == elevenlabs::PROVIDER_ID;
    if !has_explicit_model && supports_saved_model {
        if let Some(model) = config
            .and_then(|provider_config| provider_config.model)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
        {
            input.model = Some(model);
        }
    }

    if input
        .prompt
        .as_deref()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false)
    {
        return input;
    }

    if model_supports_prompt(provider_id, input.model.as_deref()) {
        input.prompt = Some(prompts::default_transcription_prompt().to_string());
    }

    input
}

fn model_supports_prompt(provider_id: &str, model: Option<&str>) -> bool {
    if provider_id != openai::PROVIDER_ID {
        return false;
    }

    matches!(
        model.map(str::trim).filter(|value| !value.is_empty()),
        Some("gpt-4o-transcribe")
            | Some("gpt-4o-mini-transcribe")
            | Some("gpt-4o-transcribe-latest")
            | Some("whisper-1")
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::ProviderConfig;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEST_DIR_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_config_dir(name: &str) -> PathBuf {
        let id = TEST_DIR_COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "vaak-speech-provider-test-{name}-{}-{id}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn openai_config_is_complete_without_local_provider_settings() {
        let settings = LocalSettingsStore::new(&temp_config_dir("openai"));

        assert!(is_config_complete("openai", &settings).unwrap());
    }

    #[test]
    fn azure_config_is_complete_only_when_required_fields_are_saved() {
        let dir = temp_config_dir("azure");
        let settings = LocalSettingsStore::new(&dir);

        settings
            .save_provider_config(
                "azure-openai",
                &ProviderConfig {
                    endpoint: Some("https://example.openai.azure.com".to_string()),
                    deployment_id: None,
                    api_version: Some("2025-04-01-preview".to_string()),
                    model: None,
                },
            )
            .unwrap();

        assert!(!is_config_complete("azure-openai", &settings).unwrap());

        settings
            .save_provider_config(
                "azure-openai",
                &ProviderConfig {
                    endpoint: Some("https://example.openai.azure.com".to_string()),
                    deployment_id: Some("gpt-4o-mini-transcribe".to_string()),
                    api_version: Some("2025-04-01-preview".to_string()),
                    model: None,
                },
            )
            .unwrap();

        assert!(is_config_complete("azure-openai", &settings).unwrap());
    }

    #[test]
    fn unsupported_speech_adapters_are_not_config_complete() {
        let settings = LocalSettingsStore::new(&temp_config_dir("unsupported"));

        assert!(!is_config_complete("gemini", &settings).unwrap());
    }

    #[test]
    fn elevenlabs_config_is_complete_without_local_provider_settings() {
        let settings = LocalSettingsStore::new(&temp_config_dir("elevenlabs"));

        assert!(is_config_complete("elevenlabs", &settings).unwrap());
    }

    #[test]
    fn applies_saved_openai_model_when_transcription_input_omits_one() {
        let input = TranscriptionInput {
            audio: vec![1],
            mime_type: "audio/webm".to_string(),
            language: None,
            prompt: None,
            model: None,
        };

        let resolved = resolve_transcription_input(
            openai::PROVIDER_ID,
            input,
            Some(ProviderConfig {
                endpoint: None,
                deployment_id: None,
                api_version: None,
                model: Some("gpt-4o-transcribe".to_string()),
            }),
        );

        assert_eq!(resolved.model.as_deref(), Some("gpt-4o-transcribe"));
    }

    #[test]
    fn explicit_input_model_wins_over_saved_provider_model() {
        let input = TranscriptionInput {
            audio: vec![1],
            mime_type: "audio/webm".to_string(),
            language: None,
            prompt: None,
            model: Some("gpt-4o-mini-transcribe".to_string()),
        };

        let resolved = resolve_transcription_input(
            openai::PROVIDER_ID,
            input,
            Some(ProviderConfig {
                endpoint: None,
                deployment_id: None,
                api_version: None,
                model: Some("gpt-4o-transcribe".to_string()),
            }),
        );

        assert_eq!(resolved.model.as_deref(), Some("gpt-4o-mini-transcribe"));
    }

    #[test]
    fn adds_default_prompt_for_openai_transcribe_models() {
        let input = TranscriptionInput {
            audio: vec![1],
            mime_type: "audio/webm".to_string(),
            language: None,
            prompt: None,
            model: Some("gpt-4o-mini-transcribe".to_string()),
        };

        let resolved = resolve_transcription_input(openai::PROVIDER_ID, input, None);

        assert!(resolved
            .prompt
            .as_deref()
            .is_some_and(|value| value.contains("Do not invent bullet points")));
    }

    #[test]
    fn default_prompt_allows_lists_when_dictated() {
        assert!(prompts::default_transcription_prompt().contains("preserve that structure"));
    }

    #[test]
    fn preserves_explicit_prompt_when_present() {
        let input = TranscriptionInput {
            audio: vec![1],
            mime_type: "audio/webm".to_string(),
            language: None,
            prompt: Some("keep product names exact".to_string()),
            model: Some("whisper-1".to_string()),
        };

        let resolved = resolve_transcription_input(openai::PROVIDER_ID, input, None);

        assert_eq!(resolved.prompt.as_deref(), Some("keep product names exact"));
    }

    #[test]
    fn does_not_add_prompt_for_openai_diarize_model() {
        let input = TranscriptionInput {
            audio: vec![1],
            mime_type: "audio/webm".to_string(),
            language: None,
            prompt: None,
            model: Some("gpt-4o-transcribe-diarize".to_string()),
        };

        let resolved = resolve_transcription_input(openai::PROVIDER_ID, input, None);

        assert_eq!(resolved.prompt, None);
    }

    #[test]
    fn does_not_add_prompt_for_elevenlabs_models() {
        let input = TranscriptionInput {
            audio: vec![1],
            mime_type: "audio/webm".to_string(),
            language: None,
            prompt: None,
            model: Some("scribe_v2".to_string()),
        };

        let resolved = resolve_transcription_input(elevenlabs::PROVIDER_ID, input, None);

        assert_eq!(resolved.prompt, None);
    }
}
