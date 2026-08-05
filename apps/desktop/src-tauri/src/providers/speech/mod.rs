use async_trait::async_trait;

use crate::providers::credentials;
use crate::providers::errors::{ProviderError, ProviderFailure};
use crate::providers::{
    normalize_audio_mime_type, normalize_language_field, normalize_optional_provider_field,
    normalize_transcription_prompt, ProviderStatus, TranscriptResult, TranscriptionInput,
};
use crate::storage::LocalSettingsStore;

mod assemblyai;
pub(crate) mod assemblyai_streaming;
mod azure;
mod azure_ai_speech;
mod deepgram;
pub(crate) mod deepgram_streaming;
mod elevenlabs;
pub(crate) mod elevenlabs_streaming;
mod gemini;
mod openai;
mod prompts;
mod smallest;
pub(crate) mod smallest_streaming;
pub(crate) mod streaming_common;

#[async_trait]
pub trait SpeechProvider {
    async fn transcribe(
        &self,
        api_key: String,
        input: TranscriptionInput,
    ) -> Result<TranscriptResult, ProviderError>;
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TranscriptionMode {
    Batch,
    Streaming,
}

impl TranscriptionMode {
    fn as_str(self) -> &'static str {
        match self {
            Self::Batch => "batch",
            Self::Streaming => "streaming",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[allow(dead_code)]
pub enum BillingUnit {
    AudioDuration,
    SessionDuration,
    Unknown,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TranscriptionModelCapabilities {
    pub language_hint: bool,
    pub prompt_or_keyterms: bool,
    pub partial_results: bool,
    pub final_results: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TranscriptionModelRoute {
    pub mode: TranscriptionMode,
    pub provider_model_id: &'static str,
    pub default_for_mode: bool,
    pub endpoint_profile_id: &'static str,
    pub audio_profile_id: &'static str,
    pub capabilities: TranscriptionModelCapabilities,
    pub retry_policy_id: &'static str,
    pub billing_unit: BillingUnit,
    pub test_profile_id: &'static str,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TranscriptionModelDefinition {
    pub provider_id: &'static str,
    pub id: &'static str,
    pub label: &'static str,
    pub routes: &'static [TranscriptionModelRoute],
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
    validate_provider_id(provider_id)?;
    let api_key = credentials::provider_key(provider_id)?;
    let provider_config = settings.provider_config_or_migrate(provider_id, || {
        credentials::legacy_provider_config(provider_id)
    })?;
    let input = normalize_transcription_input(input)?;
    let input = resolve_transcription_input_for_mode(
        provider_id,
        input,
        provider_config.clone(),
        TranscriptionMode::Batch,
        settings.transcription_prompt()?,
    )?;

    match provider_id {
        openai::PROVIDER_ID => {
            openai::OpenAiSpeechProvider::default()
                .transcribe(api_key, input)
                .await
        }
        azure::PROVIDER_ID => {
            azure::AzureOpenAiSpeechProvider::new(
                provider_config.ok_or_else(|| ProviderFailure::MissingConfiguration)?,
            )?
            .transcribe(api_key, input)
            .await
        }
        azure_ai_speech::PROVIDER_ID => {
            azure_ai_speech::AzureAiSpeechProvider::new(
                provider_config.ok_or_else(|| ProviderFailure::MissingConfiguration)?,
            )?
            .transcribe(api_key, input)
            .await
        }
        assemblyai::PROVIDER_ID => {
            assemblyai::AssemblyAiSpeechProvider::default()
                .transcribe(api_key, input)
                .await
        }
        deepgram::PROVIDER_ID => {
            deepgram::DeepgramSpeechProvider::default()
                .transcribe(api_key, input)
                .await
        }
        elevenlabs::PROVIDER_ID => {
            elevenlabs::ElevenLabsSpeechProvider::default()
                .transcribe(api_key, input)
                .await
        }
        smallest::PROVIDER_ID => {
            smallest::SmallestSpeechProvider::default()
                .transcribe(api_key, input)
                .await
        }
        gemini::PROVIDER_ID => Err(ProviderFailure::UnsupportedProvider.into()),
        _ => Err(ProviderFailure::UnsupportedProvider.into()),
    }
}

pub fn transcription_prompt(settings: &LocalSettingsStore) -> Result<String, ProviderError> {
    Ok(settings
        .transcription_prompt()?
        .unwrap_or_else(|| prompts::default_transcription_prompt().to_string()))
}

pub fn validate_provider_id(provider_id: &str) -> Result<(), ProviderError> {
    match provider_id {
        openai::PROVIDER_ID
        | azure::PROVIDER_ID
        | azure_ai_speech::PROVIDER_ID
        | assemblyai::PROVIDER_ID
        | deepgram::PROVIDER_ID
        | gemini::PROVIDER_ID
        | elevenlabs::PROVIDER_ID
        | smallest::PROVIDER_ID => Ok(()),
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

    if provider_id == azure_ai_speech::PROVIDER_ID {
        return Ok(settings
            .provider_config_or_migrate(provider_id, || {
                credentials::legacy_provider_config(provider_id)
            })?
            .map(|config| azure_ai_speech::AzureAiSpeechProvider::config_complete(&config))
            .unwrap_or(false));
    }

    if provider_id == assemblyai::PROVIDER_ID {
        return Ok(true);
    }

    if provider_id == deepgram::PROVIDER_ID {
        return Ok(true);
    }

    if provider_id == elevenlabs::PROVIDER_ID {
        return Ok(true);
    }

    if provider_id == smallest::PROVIDER_ID {
        return Ok(true);
    }

    Ok(false)
}

#[cfg(test)]
fn resolve_transcription_input(
    provider_id: &str,
    input: TranscriptionInput,
    config: Option<crate::providers::ProviderConfig>,
) -> TranscriptionInput {
    resolve_transcription_input_for_mode(provider_id, input, config, TranscriptionMode::Batch, None)
        .expect("batch transcription input should resolve in tests")
}

fn resolve_transcription_input_for_mode(
    provider_id: &str,
    mut input: TranscriptionInput,
    config: Option<crate::providers::ProviderConfig>,
    mode: TranscriptionMode,
    saved_prompt: Option<String>,
) -> Result<TranscriptionInput, ProviderError> {
    let has_explicit_model = input
        .model
        .as_deref()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    let saved_model = config
        .and_then(|provider_config| provider_config.model)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    if has_explicit_model {
        validate_model_for_mode(provider_id, input.model.as_deref(), mode)?;
    } else if let Some(model) = saved_model {
        if let Some(route) = transcription_model_route(provider_id, &model, mode) {
            input.model = Some(route.provider_model_id.to_string());
        } else {
            return Err(unsupported_model_route_error(provider_id, &model, mode));
        }
    } else if let Some((_definition, route)) = default_model_route_for_mode(provider_id, mode) {
        input.model = Some(route.provider_model_id.to_string());
    }

    if input
        .prompt
        .as_deref()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false)
    {
        return Ok(input);
    }

    if model_supports_prompt(provider_id, input.model.as_deref()) {
        input.prompt = Some(
            saved_prompt.unwrap_or_else(|| prompts::default_transcription_prompt().to_string()),
        );
    }

    Ok(input)
}

pub(crate) fn resolve_model_for_mode(
    provider_id: &str,
    config: Option<crate::providers::ProviderConfig>,
    mode: TranscriptionMode,
) -> Result<Option<String>, ProviderError> {
    validate_provider_id(provider_id)?;
    let saved_model = config
        .and_then(|provider_config| provider_config.model)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    if let Some(model) = saved_model {
        if let Some(route) = transcription_model_route(provider_id, &model, mode) {
            return Ok(Some(route.provider_model_id.to_string()));
        }
        return Err(unsupported_model_route_error(provider_id, &model, mode));
    }

    Ok(default_model_route_for_mode(provider_id, mode)
        .map(|(_definition, route)| route.provider_model_id.to_string()))
}

fn normalize_transcription_input(
    input: TranscriptionInput,
) -> Result<TranscriptionInput, ProviderError> {
    Ok(TranscriptionInput {
        audio: input.audio,
        mime_type: normalize_audio_mime_type(&input.mime_type)?,
        language: normalize_language_field(input.language)?,
        prompt: normalize_transcription_prompt(input.prompt)?,
        model: normalize_optional_provider_field(input.model, "model")?,
    })
}

fn model_supports_prompt(provider_id: &str, model: Option<&str>) -> bool {
    if provider_id == azure::PROVIDER_ID {
        return true;
    }

    let Some(model) = model.map(str::trim).filter(|value| !value.is_empty()) else {
        return false;
    };

    transcription_model_route(provider_id, model, TranscriptionMode::Batch)
        .map(|route| route.capabilities.prompt_or_keyterms)
        .unwrap_or(false)
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
                    streaming_deployment_id: None,
                    api_version: Some("2025-04-01-preview".to_string()),
                    model: None,
                    transcription_mode: None,
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
                    streaming_deployment_id: None,
                    api_version: Some("2025-04-01-preview".to_string()),
                    model: None,
                    transcription_mode: None,
                },
            )
            .unwrap();

        assert!(is_config_complete("azure-openai", &settings).unwrap());
    }

    #[test]
    fn azure_ai_speech_is_a_supported_provider_id() {
        assert!(validate_provider_id("azure-ai-speech").is_ok());
    }

    #[test]
    fn azure_ai_speech_config_is_complete_with_endpoint() {
        let dir = temp_config_dir("azure-ai-speech");
        let settings = LocalSettingsStore::new(&dir);

        settings
            .save_provider_config(
                "azure-ai-speech",
                &ProviderConfig {
                    endpoint: Some("https://example.cognitiveservices.azure.com".to_string()),
                    deployment_id: None,
                    streaming_deployment_id: None,
                    api_version: None,
                    model: None,
                    transcription_mode: None,
                },
            )
            .unwrap();

        assert!(is_config_complete("azure-ai-speech", &settings).unwrap());
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
    fn assemblyai_is_a_supported_provider_id() {
        assert!(validate_provider_id("assemblyai").is_ok());
    }

    #[test]
    fn assemblyai_config_is_complete_without_local_provider_settings() {
        let settings = LocalSettingsStore::new(&temp_config_dir("assemblyai"));

        assert!(is_config_complete("assemblyai", &settings).unwrap());
    }

    #[test]
    fn smallest_is_a_supported_provider_id() {
        assert!(validate_provider_id("smallest").is_ok());
    }

    #[test]
    fn smallest_config_is_complete_without_local_provider_settings() {
        let settings = LocalSettingsStore::new(&temp_config_dir("smallest"));

        assert!(is_config_complete("smallest", &settings).unwrap());
    }

    #[test]
    fn deepgram_is_a_supported_provider_id() {
        assert!(validate_provider_id("deepgram").is_ok());
    }

    #[test]
    fn deepgram_config_is_complete_without_local_provider_settings() {
        let settings = LocalSettingsStore::new(&temp_config_dir("deepgram"));

        assert!(is_config_complete("deepgram", &settings).unwrap());
    }

    #[test]
    fn applies_saved_deepgram_model_when_transcription_input_omits_one() {
        let input = TranscriptionInput {
            audio: vec![1],
            mime_type: "audio/webm".to_string(),
            language: None,
            prompt: None,
            model: None,
        };

        let resolved = resolve_transcription_input(
            "deepgram",
            input,
            Some(ProviderConfig {
                endpoint: None,
                deployment_id: None,
                streaming_deployment_id: None,
                api_version: None,
                model: Some(deepgram::DEFAULT_MODEL.to_string()),
                transcription_mode: None,
            }),
        );

        assert_eq!(resolved.model.as_deref(), Some("nova-3"));
    }

    #[test]
    fn applies_saved_smallest_model_when_transcription_input_omits_one() {
        let input = TranscriptionInput {
            audio: vec![1],
            mime_type: "audio/webm".to_string(),
            language: None,
            prompt: None,
            model: None,
        };

        let resolved = resolve_transcription_input(
            "smallest",
            input,
            Some(ProviderConfig {
                endpoint: None,
                deployment_id: None,
                streaming_deployment_id: None,
                api_version: None,
                model: Some("pulse".to_string()),
                transcription_mode: None,
            }),
        );

        assert_eq!(resolved.model.as_deref(), Some("pulse"));
    }

    #[test]
    fn applies_saved_smallest_pulse_pro_model_when_transcription_input_omits_one() {
        let input = TranscriptionInput {
            audio: vec![1],
            mime_type: "audio/webm".to_string(),
            language: None,
            prompt: None,
            model: None,
        };

        let resolved = resolve_transcription_input(
            "smallest",
            input,
            Some(ProviderConfig {
                endpoint: None,
                deployment_id: None,
                streaming_deployment_id: None,
                api_version: None,
                model: Some("pulse-pro".to_string()),
                transcription_mode: None,
            }),
        );

        assert_eq!(resolved.model.as_deref(), Some("pulse-pro"));
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
                streaming_deployment_id: None,
                api_version: None,
                model: Some("gpt-4o-transcribe".to_string()),
                transcription_mode: None,
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
                streaming_deployment_id: None,
                api_version: None,
                model: Some("gpt-4o-transcribe".to_string()),
                transcription_mode: None,
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
            .is_some_and(|value| value.contains("Prefer bullet points when the speaker seems to be expressing multiple distinct points")));
    }

    #[test]
    fn adds_default_prompt_for_azure_openai_transcriptions() {
        let input = TranscriptionInput {
            audio: vec![1],
            mime_type: "audio/webm".to_string(),
            language: None,
            prompt: None,
            model: None,
        };

        let resolved = resolve_transcription_input(azure::PROVIDER_ID, input, None);

        assert!(resolved.prompt.as_deref().is_some_and(
            |value| value.contains("Preserve the speaker's wording as closely as possible")
        ));
    }

    #[test]
    fn default_prompt_allows_lists_when_dictated() {
        assert!(prompts::default_transcription_prompt()
            .contains("Use numbered lists for ordered steps when sequence is clearly implied"));
    }

    #[test]
    fn saved_prompt_is_used_when_the_request_has_no_explicit_prompt() {
        let input = TranscriptionInput {
            audio: vec![1],
            mime_type: "audio/wav".to_string(),
            language: None,
            prompt: None,
            model: Some("gpt-4o-mini-transcribe".to_string()),
        };

        let resolved = resolve_transcription_input_for_mode(
            "openai",
            input,
            None,
            TranscriptionMode::Batch,
            Some("Keep names exact.".to_string()),
        )
        .unwrap();

        assert_eq!(resolved.prompt.as_deref(), Some("Keep names exact."));
    }

    #[test]
    fn saved_prompt_is_ignored_when_the_model_does_not_support_it() {
        let input = TranscriptionInput {
            audio: vec![1],
            mime_type: "audio/wav".to_string(),
            language: None,
            prompt: None,
            model: Some("nova-3".to_string()),
        };

        let resolved = resolve_transcription_input_for_mode(
            "deepgram",
            input,
            None,
            TranscriptionMode::Batch,
            Some("Keep names exact.".to_string()),
        )
        .unwrap();

        assert_eq!(resolved.prompt, None);
    }

    #[test]
    fn saved_prompt_is_not_routed_to_assemblyai_until_its_adapter_supports_it() {
        let input = TranscriptionInput {
            audio: vec![1],
            mime_type: "audio/wav".to_string(),
            language: None,
            prompt: None,
            model: Some("universal-3-5-pro".to_string()),
        };

        let resolved = resolve_transcription_input_for_mode(
            "assemblyai",
            input,
            None,
            TranscriptionMode::Batch,
            Some("Keep names exact.".to_string()),
        )
        .unwrap();

        assert_eq!(resolved.prompt, None);
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

    #[test]
    fn accepts_long_bounded_prompts_before_resolution() {
        let prompt = "a".repeat(4_096);

        let normalized = normalize_transcription_input(TranscriptionInput {
            audio: vec![1],
            mime_type: "audio/webm".to_string(),
            language: Some("en".to_string()),
            prompt: Some(prompt.clone()),
            model: Some("gpt-4o-mini-transcribe".to_string()),
        })
        .unwrap();

        assert_eq!(normalized.prompt.as_deref(), Some(prompt.as_str()));
    }

    #[test]
    fn rejects_over_limit_prompts_before_resolution() {
        let prompt = "a".repeat(4_097);

        let err = normalize_transcription_input(TranscriptionInput {
            audio: vec![1],
            mime_type: "audio/webm".to_string(),
            language: Some("en".to_string()),
            prompt: Some(prompt),
            model: Some("gpt-4o-mini-transcribe".to_string()),
        })
        .unwrap_err();

        assert_eq!(err.code, "invalid_provider_request");
    }

    #[test]
    fn applies_saved_assemblyai_model_when_transcription_input_omits_one() {
        let input = TranscriptionInput {
            audio: vec![1],
            mime_type: "audio/webm".to_string(),
            language: None,
            prompt: None,
            model: None,
        };

        let resolved = resolve_transcription_input(
            "assemblyai",
            input,
            Some(ProviderConfig {
                endpoint: None,
                deployment_id: None,
                streaming_deployment_id: None,
                api_version: None,
                model: Some("universal-3-pro".to_string()),
                transcription_mode: None,
            }),
        );

        assert_eq!(resolved.model.as_deref(), Some("universal-3-pro"));
    }

    #[test]
    fn catalog_resolves_batch_streaming_and_both_route_models() {
        let batch_route = transcription_model_route(
            assemblyai::PROVIDER_ID,
            "universal-3-pro",
            TranscriptionMode::Batch,
        )
        .expect("assemblyai batch route");
        let streaming_route = transcription_model_route(
            assemblyai::PROVIDER_ID,
            "u3-rt-pro",
            TranscriptionMode::Streaming,
        )
        .expect("assemblyai streaming route");
        let both_route_definition =
            transcription_model_definition(assemblyai::PROVIDER_ID, "universal-3-5-pro")
                .expect("assemblyai both-route model");

        assert_eq!(batch_route.endpoint_profile_id, "assemblyai-v2-transcript");
        assert_eq!(batch_route.audio_profile_id, "assemblyai-batch-file");
        assert_eq!(
            streaming_route.audio_profile_id,
            "assemblyai-streaming-pcm16-16khz"
        );
        assert!(batch_route.default_for_mode);
        assert!(streaming_route.default_for_mode);
        assert!(both_route_definition
            .routes
            .iter()
            .any(|route| route.mode == TranscriptionMode::Batch));
        assert!(both_route_definition
            .routes
            .iter()
            .any(|route| route.mode == TranscriptionMode::Streaming));
    }

    #[test]
    fn assemblyai_streaming_resolution_rejects_saved_batch_only_model() {
        let err = resolve_model_for_mode(
            assemblyai::PROVIDER_ID,
            Some(ProviderConfig {
                endpoint: None,
                deployment_id: None,
                streaming_deployment_id: None,
                api_version: None,
                model: Some("universal-3-pro".to_string()),
                transcription_mode: None,
            }),
            TranscriptionMode::Streaming,
        )
        .expect_err("batch-only model should not resolve for streaming");

        assert_eq!(err.code, "invalid_provider_request");
        assert!(err
            .message
            .contains("universal-3-pro does not support streaming transcription"));
    }

    #[test]
    fn assemblyai_streaming_resolution_uses_default_when_no_model_is_saved() {
        let resolved = resolve_model_for_mode(
            assemblyai::PROVIDER_ID,
            Some(ProviderConfig {
                endpoint: None,
                deployment_id: None,
                streaming_deployment_id: None,
                api_version: None,
                model: None,
                transcription_mode: None,
            }),
            TranscriptionMode::Streaming,
        )
        .expect("streaming default should resolve");

        assert_eq!(resolved.as_deref(), Some("u3-rt-pro"));
    }

    #[test]
    fn assemblyai_streaming_resolution_honors_saved_streaming_model() {
        let resolved = resolve_model_for_mode(
            assemblyai::PROVIDER_ID,
            Some(ProviderConfig {
                endpoint: None,
                deployment_id: None,
                streaming_deployment_id: None,
                api_version: None,
                model: Some("u3-rt-pro".to_string()),
                transcription_mode: None,
            }),
            TranscriptionMode::Streaming,
        )
        .expect("streaming model should resolve");

        assert_eq!(resolved.as_deref(), Some("u3-rt-pro"));
    }

    #[test]
    fn assemblyai_streaming_resolution_honors_selected_universal_35_pro() {
        let resolved = resolve_model_for_mode(
            assemblyai::PROVIDER_ID,
            Some(ProviderConfig {
                endpoint: None,
                deployment_id: None,
                streaming_deployment_id: None,
                api_version: None,
                model: Some("universal-3-5-pro".to_string()),
                transcription_mode: None,
            }),
            TranscriptionMode::Streaming,
        )
        .expect("streaming model should resolve");

        assert_eq!(resolved.as_deref(), Some("universal-3-5-pro"));
    }

    #[test]
    fn assemblyai_streaming_resolution_honors_selected_streaming_english_model() {
        let resolved = resolve_model_for_mode(
            assemblyai::PROVIDER_ID,
            Some(ProviderConfig {
                endpoint: None,
                deployment_id: None,
                streaming_deployment_id: None,
                api_version: None,
                model: Some("universal-streaming-english".to_string()),
                transcription_mode: None,
            }),
            TranscriptionMode::Streaming,
        )
        .expect("streaming model should resolve");

        assert_eq!(resolved.as_deref(), Some("universal-streaming-english"));
    }

    #[test]
    fn batch_resolution_rejects_saved_streaming_only_model() {
        let input = TranscriptionInput {
            audio: vec![1],
            mime_type: "audio/webm".to_string(),
            language: None,
            prompt: None,
            model: None,
        };

        let err = resolve_transcription_input_for_mode(
            assemblyai::PROVIDER_ID,
            input,
            Some(ProviderConfig {
                endpoint: None,
                deployment_id: None,
                streaming_deployment_id: None,
                api_version: None,
                model: Some("u3-rt-pro".to_string()),
                transcription_mode: None,
            }),
            TranscriptionMode::Batch,
            None,
        )
        .expect_err("streaming-only model should not resolve for batch");

        assert_eq!(err.code, "invalid_provider_request");
        assert!(err
            .message
            .contains("u3-rt-pro does not support batch transcription"));
    }

    #[test]
    fn explicit_streaming_model_is_rejected_for_batch_transcription() {
        let input = TranscriptionInput {
            audio: vec![1],
            mime_type: "audio/webm".to_string(),
            language: None,
            prompt: None,
            model: Some("u3-rt-pro".to_string()),
        };

        let err = resolve_transcription_input_for_mode(
            assemblyai::PROVIDER_ID,
            input,
            None,
            TranscriptionMode::Batch,
            None,
        )
        .expect_err("streaming-only model should not resolve for batch");

        assert_eq!(err.code, "invalid_provider_request");
        assert!(err.message.contains("does not support batch transcription"));
    }

    #[test]
    fn openai_realtime_transcription_model_is_streaming_capable() {
        let route = transcription_model_route(
            openai::PROVIDER_ID,
            "gpt-realtime-whisper",
            TranscriptionMode::Streaming,
        )
        .expect("openai realtime model");

        assert_eq!(route.audio_profile_id, "openai-realtime-pcm-24khz");
        assert!(route.capabilities.final_results);
        assert!(route.capabilities.partial_results);
    }

    #[test]
    fn openai_catalog_matches_current_speech_to_text_models() {
        let batch_models = [
            "gpt-4o-mini-transcribe",
            "gpt-4o-transcribe",
            "gpt-4o-transcribe-diarize",
            "whisper-1",
        ];

        for model in batch_models {
            assert!(
                transcription_model_route(openai::PROVIDER_ID, model, TranscriptionMode::Batch)
                    .is_some(),
                "{model} should support OpenAI batch transcription"
            );
        }

        assert!(transcription_model_route(
            openai::PROVIDER_ID,
            "gpt-4o-transcribe-latest",
            TranscriptionMode::Batch,
        )
        .is_none());
    }

    #[test]
    fn deepgram_catalog_keeps_dictation_model_list_focused() {
        let route =
            transcription_model_route(deepgram::PROVIDER_ID, "nova-3", TranscriptionMode::Batch)
                .expect("nova-3 should support Deepgram batch transcription");

        assert_eq!(route.provider_model_id, "nova-3");
        assert_eq!(route.endpoint_profile_id, "deepgram-listen");
        assert!(route.default_for_mode);

        for model in [
            "nova-2-finance",
            "nova-2-video",
            "nova-2-drivethru",
            "nova-2-atc",
            "whisper-large",
            "flux-general-en",
        ] {
            assert!(
                transcription_model_definition(deepgram::PROVIDER_ID, model).is_none(),
                "{model} should not be a user-selectable Vaak dictation model"
            );
        }
    }

    #[test]
    fn deepgram_nova_3_is_streaming_capable_without_adding_flux() {
        let streaming_route = transcription_model_route(
            deepgram::PROVIDER_ID,
            "nova-3",
            TranscriptionMode::Streaming,
        )
        .expect("nova-3 should support Deepgram streaming transcription");

        assert_eq!(streaming_route.provider_model_id, "nova-3");
        assert_eq!(streaming_route.endpoint_profile_id, "deepgram-live-listen");
        assert_eq!(
            streaming_route.audio_profile_id,
            "deepgram-streaming-linear16-16khz"
        );
        assert!(streaming_route.default_for_mode);
        assert!(streaming_route.capabilities.partial_results);
        assert!(streaming_route.capabilities.final_results);
        assert!(transcription_model_definition(deepgram::PROVIDER_ID, "flux-general-en").is_none());
        assert!(transcription_model_route(
            deepgram::PROVIDER_ID,
            "flux-general-en",
            TranscriptionMode::Streaming,
        )
        .is_none());
    }

    #[test]
    fn deepgram_streaming_resolution_uses_nova_3_default() {
        let resolved =
            resolve_model_for_mode(deepgram::PROVIDER_ID, None, TranscriptionMode::Streaming)
                .expect("deepgram streaming default should resolve");

        assert_eq!(resolved.as_deref(), Some("nova-3"));
    }

    #[test]
    fn catalog_does_not_resolve_unimplemented_provider_streaming_models() {
        assert!(transcription_model_route(
            deepgram::PROVIDER_ID,
            "flux-general-en",
            TranscriptionMode::Streaming,
        )
        .is_none());
        assert!(transcription_model_route(
            deepgram::PROVIDER_ID,
            "flux-general-multi",
            TranscriptionMode::Streaming,
        )
        .is_none());
    }

    #[test]
    fn elevenlabs_realtime_is_streaming_capable_without_remapping_batch_models() {
        let streaming_route = transcription_model_route(
            elevenlabs::PROVIDER_ID,
            "scribe_v2_realtime",
            TranscriptionMode::Streaming,
        )
        .expect("elevenlabs realtime streaming route");

        assert_eq!(streaming_route.provider_model_id, "scribe_v2_realtime");
        assert_eq!(
            streaming_route.endpoint_profile_id,
            "elevenlabs-realtime-stt"
        );
        assert_eq!(
            streaming_route.audio_profile_id,
            "elevenlabs-streaming-pcm16-16khz-json-base64"
        );
        assert!(streaming_route.default_for_mode);
        assert!(streaming_route.capabilities.partial_results);
        assert!(streaming_route.capabilities.final_results);
        assert!(transcription_model_route(
            elevenlabs::PROVIDER_ID,
            "scribe_v2",
            TranscriptionMode::Streaming,
        )
        .is_none());
        assert!(transcription_model_route(
            elevenlabs::PROVIDER_ID,
            "scribe_v1",
            TranscriptionMode::Streaming,
        )
        .is_none());
    }

    #[test]
    fn elevenlabs_streaming_resolution_rejects_saved_batch_model() {
        let err = resolve_model_for_mode(
            elevenlabs::PROVIDER_ID,
            Some(ProviderConfig {
                endpoint: None,
                deployment_id: None,
                streaming_deployment_id: None,
                api_version: None,
                model: Some("scribe_v2".to_string()),
                transcription_mode: None,
            }),
            TranscriptionMode::Streaming,
        )
        .expect_err("scribe_v2 should remain batch only");

        assert_eq!(err.code, "invalid_provider_request");
        assert!(err
            .message
            .contains("elevenlabs model scribe_v2 does not support streaming transcription"));
    }

    #[test]
    fn elevenlabs_streaming_resolution_uses_realtime_default() {
        let resolved =
            resolve_model_for_mode(elevenlabs::PROVIDER_ID, None, TranscriptionMode::Streaming)
                .expect("elevenlabs streaming default should resolve");

        assert_eq!(resolved.as_deref(), Some("scribe_v2_realtime"));
    }

    #[test]
    fn smallest_pulse_is_streaming_capable_without_remapping_pulse_pro() {
        let streaming_route =
            transcription_model_route(smallest::PROVIDER_ID, "pulse", TranscriptionMode::Streaming)
                .expect("smallest pulse streaming route");

        assert_eq!(streaming_route.provider_model_id, "pulse");
        assert_eq!(
            streaming_route.endpoint_profile_id,
            "smallest-waves-stt-live"
        );
        assert_eq!(
            streaming_route.audio_profile_id,
            "smallest-streaming-linear16-16khz"
        );
        assert!(streaming_route.default_for_mode);
        assert!(streaming_route.capabilities.partial_results);
        assert!(streaming_route.capabilities.final_results);
        assert!(transcription_model_route(
            smallest::PROVIDER_ID,
            "pulse-pro",
            TranscriptionMode::Streaming,
        )
        .is_none());
    }

    #[test]
    fn smallest_streaming_resolution_rejects_saved_pulse_pro_model() {
        let err = resolve_model_for_mode(
            smallest::PROVIDER_ID,
            Some(ProviderConfig {
                endpoint: None,
                deployment_id: None,
                streaming_deployment_id: None,
                api_version: None,
                model: Some("pulse-pro".to_string()),
                transcription_mode: None,
            }),
            TranscriptionMode::Streaming,
        )
        .expect_err("pulse-pro should remain batch only");

        assert_eq!(err.code, "invalid_provider_request");
        assert!(err
            .message
            .contains("smallest model pulse-pro does not support streaming transcription"));
    }

    #[test]
    fn smallest_streaming_resolution_uses_pulse_default() {
        let resolved =
            resolve_model_for_mode(smallest::PROVIDER_ID, None, TranscriptionMode::Streaming)
                .expect("smallest streaming default should resolve");

        assert_eq!(resolved.as_deref(), Some("pulse"));
    }

    #[test]
    fn universal_3_pro_never_resolves_to_u3_rt_pro() {
        assert_eq!(
            transcription_model_route(
                assemblyai::PROVIDER_ID,
                "universal-3-pro",
                TranscriptionMode::Batch,
            )
            .map(|route| route.provider_model_id),
            Some("universal-3-pro")
        );
        assert!(transcription_model_route(
            assemblyai::PROVIDER_ID,
            "universal-3-pro",
            TranscriptionMode::Streaming,
        )
        .is_none());
    }

    #[test]
    fn future_test_runner_can_select_models_by_test_profile_id() {
        let (definition, route) =
            transcription_model_route_for_test_profile("assemblyai-universal-3-5-pro-streaming")
                .expect("test profile route");

        assert_eq!(definition.id, "universal-3-5-pro");
        assert_eq!(route.mode, TranscriptionMode::Streaming);
        assert_eq!(route.provider_model_id, "universal-3-5-pro");
    }
}

fn validate_model_for_mode(
    provider_id: &str,
    model: Option<&str>,
    mode: TranscriptionMode,
) -> Result<(), ProviderError> {
    let Some(model) = model.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(());
    };

    if transcription_model_route(provider_id, model, mode).is_some() {
        return Ok(());
    }

    Err(unsupported_model_route_error(provider_id, model, mode))
}

fn unsupported_model_route_error(
    provider_id: &str,
    model: &str,
    mode: TranscriptionMode,
) -> ProviderError {
    ProviderFailure::InvalidRequest(format!(
        "{provider_id} model {model} does not support {} transcription",
        mode.as_str()
    ))
    .into()
}

pub(crate) fn transcription_model_route(
    provider_id: &str,
    model_id: &str,
    mode: TranscriptionMode,
) -> Option<&'static TranscriptionModelRoute> {
    transcription_model_definition(provider_id, model_id)
        .and_then(|definition| definition.routes.iter().find(|route| route.mode == mode))
}

pub(crate) fn transcription_model_definition(
    provider_id: &str,
    model_id: &str,
) -> Option<&'static TranscriptionModelDefinition> {
    TRANSCRIPTION_MODEL_CATALOG
        .iter()
        .find(|definition| definition.provider_id == provider_id && definition.id == model_id)
}

fn default_model_route_for_mode(
    provider_id: &str,
    mode: TranscriptionMode,
) -> Option<(
    &'static TranscriptionModelDefinition,
    &'static TranscriptionModelRoute,
)> {
    TRANSCRIPTION_MODEL_CATALOG
        .iter()
        .filter(|definition| definition.provider_id == provider_id)
        .find_map(|definition| {
            definition
                .routes
                .iter()
                .find(|route| route.mode == mode && route.default_for_mode)
                .map(|route| (definition, route))
        })
}

#[allow(dead_code)]
pub(crate) fn transcription_model_route_for_test_profile(
    test_profile_id: &str,
) -> Option<(
    &'static TranscriptionModelDefinition,
    &'static TranscriptionModelRoute,
)> {
    TRANSCRIPTION_MODEL_CATALOG.iter().find_map(|definition| {
        definition
            .routes
            .iter()
            .find(|route| route.test_profile_id == test_profile_id)
            .map(|route| (definition, route))
    })
}

const BATCH_LANGUAGE_PROMPT_FINAL: TranscriptionModelCapabilities =
    TranscriptionModelCapabilities {
        language_hint: true,
        prompt_or_keyterms: true,
        partial_results: false,
        final_results: true,
    };
const BATCH_LANGUAGE_FINAL: TranscriptionModelCapabilities = TranscriptionModelCapabilities {
    language_hint: true,
    prompt_or_keyterms: false,
    partial_results: false,
    final_results: true,
};
const STREAMING_LANGUAGE_PARTIAL_FINAL: TranscriptionModelCapabilities =
    TranscriptionModelCapabilities {
        language_hint: true,
        prompt_or_keyterms: false,
        partial_results: true,
        final_results: true,
    };

const OPENAI_GPT_4O_MINI_TRANSCRIBE_ROUTES: &[TranscriptionModelRoute] =
    &[TranscriptionModelRoute {
        mode: TranscriptionMode::Batch,
        provider_model_id: "gpt-4o-mini-transcribe",
        default_for_mode: true,
        endpoint_profile_id: "openai-audio-transcriptions",
        audio_profile_id: "openai-batch-file",
        capabilities: BATCH_LANGUAGE_PROMPT_FINAL,
        retry_policy_id: "http-file",
        billing_unit: BillingUnit::AudioDuration,
        test_profile_id: "openai-gpt-4o-mini-transcribe-batch",
    }];
const OPENAI_GPT_4O_TRANSCRIBE_ROUTES: &[TranscriptionModelRoute] = &[TranscriptionModelRoute {
    mode: TranscriptionMode::Batch,
    provider_model_id: "gpt-4o-transcribe",
    default_for_mode: false,
    endpoint_profile_id: "openai-audio-transcriptions",
    audio_profile_id: "openai-batch-file",
    capabilities: BATCH_LANGUAGE_PROMPT_FINAL,
    retry_policy_id: "http-file",
    billing_unit: BillingUnit::AudioDuration,
    test_profile_id: "openai-gpt-4o-transcribe-batch",
}];
const OPENAI_GPT_4O_TRANSCRIBE_DIARIZE_ROUTES: &[TranscriptionModelRoute] =
    &[TranscriptionModelRoute {
        mode: TranscriptionMode::Batch,
        provider_model_id: "gpt-4o-transcribe-diarize",
        default_for_mode: false,
        endpoint_profile_id: "openai-audio-transcriptions",
        audio_profile_id: "openai-batch-file",
        capabilities: BATCH_LANGUAGE_FINAL,
        retry_policy_id: "http-file",
        billing_unit: BillingUnit::AudioDuration,
        test_profile_id: "openai-gpt-4o-transcribe-diarize-batch",
    }];
const OPENAI_WHISPER_1_ROUTES: &[TranscriptionModelRoute] = &[TranscriptionModelRoute {
    mode: TranscriptionMode::Batch,
    provider_model_id: "whisper-1",
    default_for_mode: false,
    endpoint_profile_id: "openai-audio-transcriptions",
    audio_profile_id: "openai-batch-file",
    capabilities: BATCH_LANGUAGE_PROMPT_FINAL,
    retry_policy_id: "http-file",
    billing_unit: BillingUnit::AudioDuration,
    test_profile_id: "openai-whisper-1-batch",
}];
const OPENAI_GPT_REALTIME_WHISPER_ROUTES: &[TranscriptionModelRoute] = &[TranscriptionModelRoute {
    mode: TranscriptionMode::Streaming,
    provider_model_id: "gpt-realtime-whisper",
    default_for_mode: true,
    endpoint_profile_id: "openai-realtime-transcription",
    audio_profile_id: "openai-realtime-pcm-24khz",
    capabilities: STREAMING_LANGUAGE_PARTIAL_FINAL,
    retry_policy_id: "websocket-session",
    billing_unit: BillingUnit::SessionDuration,
    test_profile_id: "openai-gpt-realtime-whisper-streaming",
}];
const ASSEMBLYAI_UNIVERSAL_3_PRO_ROUTES: &[TranscriptionModelRoute] = &[TranscriptionModelRoute {
    mode: TranscriptionMode::Batch,
    provider_model_id: "universal-3-pro",
    default_for_mode: true,
    endpoint_profile_id: "assemblyai-v2-transcript",
    audio_profile_id: "assemblyai-batch-file",
    capabilities: BATCH_LANGUAGE_FINAL,
    retry_policy_id: "http-async-job",
    billing_unit: BillingUnit::AudioDuration,
    test_profile_id: "assemblyai-universal-3-pro-batch",
}];
const ASSEMBLYAI_UNIVERSAL_3_5_PRO_ROUTES: &[TranscriptionModelRoute] = &[
    TranscriptionModelRoute {
        mode: TranscriptionMode::Batch,
        provider_model_id: "universal-3-5-pro",
        default_for_mode: false,
        endpoint_profile_id: "assemblyai-v2-transcript",
        audio_profile_id: "assemblyai-batch-file",
        capabilities: BATCH_LANGUAGE_FINAL,
        retry_policy_id: "http-async-job",
        billing_unit: BillingUnit::AudioDuration,
        test_profile_id: "assemblyai-universal-3-5-pro-batch",
    },
    TranscriptionModelRoute {
        mode: TranscriptionMode::Streaming,
        provider_model_id: "universal-3-5-pro",
        default_for_mode: false,
        endpoint_profile_id: "assemblyai-v3-streaming-ws",
        audio_profile_id: "assemblyai-streaming-pcm16-16khz",
        capabilities: STREAMING_LANGUAGE_PARTIAL_FINAL,
        retry_policy_id: "websocket-session",
        billing_unit: BillingUnit::SessionDuration,
        test_profile_id: "assemblyai-universal-3-5-pro-streaming",
    },
];
const ASSEMBLYAI_UNIVERSAL_2_ROUTES: &[TranscriptionModelRoute] = &[TranscriptionModelRoute {
    mode: TranscriptionMode::Batch,
    provider_model_id: "universal-2",
    default_for_mode: false,
    endpoint_profile_id: "assemblyai-v2-transcript",
    audio_profile_id: "assemblyai-batch-file",
    capabilities: BATCH_LANGUAGE_FINAL,
    retry_policy_id: "http-async-job",
    billing_unit: BillingUnit::AudioDuration,
    test_profile_id: "assemblyai-universal-2-batch",
}];
const ASSEMBLYAI_U3_RT_PRO_ROUTES: &[TranscriptionModelRoute] = &[TranscriptionModelRoute {
    mode: TranscriptionMode::Streaming,
    provider_model_id: "u3-rt-pro",
    default_for_mode: true,
    endpoint_profile_id: "assemblyai-v3-streaming-ws",
    audio_profile_id: "assemblyai-streaming-pcm16-16khz",
    capabilities: STREAMING_LANGUAGE_PARTIAL_FINAL,
    retry_policy_id: "websocket-session",
    billing_unit: BillingUnit::SessionDuration,
    test_profile_id: "assemblyai-u3-rt-pro-streaming",
}];
const ASSEMBLYAI_UNIVERSAL_STREAMING_ENGLISH_ROUTES: &[TranscriptionModelRoute] =
    &[TranscriptionModelRoute {
        mode: TranscriptionMode::Streaming,
        provider_model_id: "universal-streaming-english",
        default_for_mode: false,
        endpoint_profile_id: "assemblyai-v3-streaming-ws",
        audio_profile_id: "assemblyai-streaming-pcm16-16khz",
        capabilities: STREAMING_LANGUAGE_PARTIAL_FINAL,
        retry_policy_id: "websocket-session",
        billing_unit: BillingUnit::SessionDuration,
        test_profile_id: "assemblyai-universal-streaming-english-streaming",
    }];
const ASSEMBLYAI_UNIVERSAL_STREAMING_MULTILINGUAL_ROUTES: &[TranscriptionModelRoute] =
    &[TranscriptionModelRoute {
        mode: TranscriptionMode::Streaming,
        provider_model_id: "universal-streaming-multilingual",
        default_for_mode: false,
        endpoint_profile_id: "assemblyai-v3-streaming-ws",
        audio_profile_id: "assemblyai-streaming-pcm16-16khz",
        capabilities: STREAMING_LANGUAGE_PARTIAL_FINAL,
        retry_policy_id: "websocket-session",
        billing_unit: BillingUnit::SessionDuration,
        test_profile_id: "assemblyai-universal-streaming-multilingual-streaming",
    }];

const DEEPGRAM_NOVA_3_ROUTES: &[TranscriptionModelRoute] = &[
    TranscriptionModelRoute {
        mode: TranscriptionMode::Batch,
        provider_model_id: "nova-3",
        default_for_mode: true,
        endpoint_profile_id: "deepgram-listen",
        audio_profile_id: "deepgram-batch-file",
        capabilities: BATCH_LANGUAGE_FINAL,
        retry_policy_id: "http-file",
        billing_unit: BillingUnit::AudioDuration,
        test_profile_id: "deepgram-nova-3-batch",
    },
    TranscriptionModelRoute {
        mode: TranscriptionMode::Streaming,
        provider_model_id: "nova-3",
        default_for_mode: true,
        endpoint_profile_id: "deepgram-live-listen",
        audio_profile_id: "deepgram-streaming-linear16-16khz",
        capabilities: STREAMING_LANGUAGE_PARTIAL_FINAL,
        retry_policy_id: "websocket-session",
        billing_unit: BillingUnit::AudioDuration,
        test_profile_id: "deepgram-nova-3-streaming",
    },
];
const ELEVENLABS_SCRIBE_V2_ROUTES: &[TranscriptionModelRoute] = &[TranscriptionModelRoute {
    mode: TranscriptionMode::Batch,
    provider_model_id: "scribe_v2",
    default_for_mode: true,
    endpoint_profile_id: "elevenlabs-speech-to-text",
    audio_profile_id: "elevenlabs-batch-file",
    capabilities: BATCH_LANGUAGE_FINAL,
    retry_policy_id: "http-file",
    billing_unit: BillingUnit::AudioDuration,
    test_profile_id: "elevenlabs-scribe-v2-batch",
}];
const ELEVENLABS_SCRIBE_V1_ROUTES: &[TranscriptionModelRoute] = &[TranscriptionModelRoute {
    mode: TranscriptionMode::Batch,
    provider_model_id: "scribe_v1",
    default_for_mode: false,
    endpoint_profile_id: "elevenlabs-speech-to-text",
    audio_profile_id: "elevenlabs-batch-file",
    capabilities: BATCH_LANGUAGE_FINAL,
    retry_policy_id: "http-file",
    billing_unit: BillingUnit::AudioDuration,
    test_profile_id: "elevenlabs-scribe-v1-batch",
}];
const ELEVENLABS_SCRIBE_V2_REALTIME_ROUTES: &[TranscriptionModelRoute] =
    &[TranscriptionModelRoute {
        mode: TranscriptionMode::Streaming,
        provider_model_id: "scribe_v2_realtime",
        default_for_mode: true,
        endpoint_profile_id: "elevenlabs-realtime-stt",
        audio_profile_id: "elevenlabs-streaming-pcm16-16khz-json-base64",
        capabilities: STREAMING_LANGUAGE_PARTIAL_FINAL,
        retry_policy_id: "websocket-session",
        billing_unit: BillingUnit::SessionDuration,
        test_profile_id: "elevenlabs-scribe-v2-realtime-streaming",
    }];
const SMALLEST_PULSE_ROUTES: &[TranscriptionModelRoute] = &[
    TranscriptionModelRoute {
        mode: TranscriptionMode::Batch,
        provider_model_id: "pulse",
        default_for_mode: true,
        endpoint_profile_id: "smallest-waves-stt",
        audio_profile_id: "smallest-batch-file",
        capabilities: BATCH_LANGUAGE_FINAL,
        retry_policy_id: "http-file",
        billing_unit: BillingUnit::AudioDuration,
        test_profile_id: "smallest-pulse-batch",
    },
    TranscriptionModelRoute {
        mode: TranscriptionMode::Streaming,
        provider_model_id: "pulse",
        default_for_mode: true,
        endpoint_profile_id: "smallest-waves-stt-live",
        audio_profile_id: "smallest-streaming-linear16-16khz",
        capabilities: STREAMING_LANGUAGE_PARTIAL_FINAL,
        retry_policy_id: "websocket-session",
        billing_unit: BillingUnit::SessionDuration,
        test_profile_id: "smallest-pulse-streaming",
    },
];
const SMALLEST_PULSE_PRO_ROUTES: &[TranscriptionModelRoute] = &[TranscriptionModelRoute {
    mode: TranscriptionMode::Batch,
    provider_model_id: "pulse-pro",
    default_for_mode: false,
    endpoint_profile_id: "smallest-waves-stt",
    audio_profile_id: "smallest-batch-file",
    capabilities: BATCH_LANGUAGE_FINAL,
    retry_policy_id: "http-file",
    billing_unit: BillingUnit::AudioDuration,
    test_profile_id: "smallest-pulse-pro-batch",
}];

pub(crate) const TRANSCRIPTION_MODEL_CATALOG: &[TranscriptionModelDefinition] = &[
    TranscriptionModelDefinition {
        provider_id: openai::PROVIDER_ID,
        id: "gpt-4o-mini-transcribe",
        label: "GPT-4o mini Transcribe",
        routes: OPENAI_GPT_4O_MINI_TRANSCRIBE_ROUTES,
    },
    TranscriptionModelDefinition {
        provider_id: openai::PROVIDER_ID,
        id: "gpt-4o-transcribe",
        label: "GPT-4o Transcribe",
        routes: OPENAI_GPT_4O_TRANSCRIBE_ROUTES,
    },
    TranscriptionModelDefinition {
        provider_id: openai::PROVIDER_ID,
        id: "gpt-4o-transcribe-diarize",
        label: "GPT-4o Transcribe Diarize",
        routes: OPENAI_GPT_4O_TRANSCRIBE_DIARIZE_ROUTES,
    },
    TranscriptionModelDefinition {
        provider_id: openai::PROVIDER_ID,
        id: "whisper-1",
        label: "Whisper-1",
        routes: OPENAI_WHISPER_1_ROUTES,
    },
    TranscriptionModelDefinition {
        provider_id: openai::PROVIDER_ID,
        id: "gpt-realtime-whisper",
        label: "GPT Realtime Whisper",
        routes: OPENAI_GPT_REALTIME_WHISPER_ROUTES,
    },
    TranscriptionModelDefinition {
        provider_id: assemblyai::PROVIDER_ID,
        id: "universal-3-5-pro",
        label: "Universal-3.5 Pro",
        routes: ASSEMBLYAI_UNIVERSAL_3_5_PRO_ROUTES,
    },
    TranscriptionModelDefinition {
        provider_id: assemblyai::PROVIDER_ID,
        id: "universal-3-pro",
        label: "Universal-3 Pro",
        routes: ASSEMBLYAI_UNIVERSAL_3_PRO_ROUTES,
    },
    TranscriptionModelDefinition {
        provider_id: assemblyai::PROVIDER_ID,
        id: "universal-2",
        label: "Universal-2",
        routes: ASSEMBLYAI_UNIVERSAL_2_ROUTES,
    },
    TranscriptionModelDefinition {
        provider_id: assemblyai::PROVIDER_ID,
        id: "u3-rt-pro",
        label: "Universal-3 Realtime Pro",
        routes: ASSEMBLYAI_U3_RT_PRO_ROUTES,
    },
    TranscriptionModelDefinition {
        provider_id: assemblyai::PROVIDER_ID,
        id: "universal-streaming-english",
        label: "Universal Streaming English",
        routes: ASSEMBLYAI_UNIVERSAL_STREAMING_ENGLISH_ROUTES,
    },
    TranscriptionModelDefinition {
        provider_id: assemblyai::PROVIDER_ID,
        id: "universal-streaming-multilingual",
        label: "Universal Streaming Multilingual",
        routes: ASSEMBLYAI_UNIVERSAL_STREAMING_MULTILINGUAL_ROUTES,
    },
    TranscriptionModelDefinition {
        provider_id: deepgram::PROVIDER_ID,
        id: "nova-3",
        label: "Nova-3",
        routes: DEEPGRAM_NOVA_3_ROUTES,
    },
    TranscriptionModelDefinition {
        provider_id: elevenlabs::PROVIDER_ID,
        id: "scribe_v2",
        label: "Scribe v2",
        routes: ELEVENLABS_SCRIBE_V2_ROUTES,
    },
    TranscriptionModelDefinition {
        provider_id: elevenlabs::PROVIDER_ID,
        id: "scribe_v1",
        label: "Scribe v1",
        routes: ELEVENLABS_SCRIBE_V1_ROUTES,
    },
    TranscriptionModelDefinition {
        provider_id: elevenlabs::PROVIDER_ID,
        id: "scribe_v2_realtime",
        label: "Scribe v2 Realtime",
        routes: ELEVENLABS_SCRIBE_V2_REALTIME_ROUTES,
    },
    TranscriptionModelDefinition {
        provider_id: smallest::PROVIDER_ID,
        id: "pulse",
        label: "Pulse",
        routes: SMALLEST_PULSE_ROUTES,
    },
    TranscriptionModelDefinition {
        provider_id: smallest::PROVIDER_ID,
        id: "pulse-pro",
        label: "Pulse Pro",
        routes: SMALLEST_PULSE_PRO_ROUTES,
    },
];
