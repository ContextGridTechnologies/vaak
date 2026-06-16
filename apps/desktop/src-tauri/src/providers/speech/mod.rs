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
mod deepgram;
mod elevenlabs;
mod gemini;
mod openai;
mod prompts;
mod smallest;

#[async_trait]
pub trait SpeechProvider {
    async fn transcribe(
        &self,
        api_key: String,
        input: TranscriptionInput,
    ) -> Result<TranscriptResult, ProviderError>;
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SpeechTranscriptionMode {
    Async,
    Streaming,
}

impl SpeechTranscriptionMode {
    fn as_str(self) -> &'static str {
        match self {
            Self::Async => "async",
            Self::Streaming => "streaming",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SpeechModelCapability {
    pub provider_id: &'static str,
    pub model_id: &'static str,
    pub mode: SpeechTranscriptionMode,
    pub default_for_mode: bool,
    pub audio_profile_id: &'static str,
    pub supports_language_hint: bool,
    pub supports_prompt_or_keyterms: bool,
    pub supports_partial_results: bool,
    pub supports_final_results: bool,
    pub retry_class: &'static str,
    pub billing_mode: &'static str,
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
        SpeechTranscriptionMode::Async,
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

pub fn validate_provider_id(provider_id: &str) -> Result<(), ProviderError> {
    match provider_id {
        openai::PROVIDER_ID
        | azure::PROVIDER_ID
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
    resolve_transcription_input_for_mode(provider_id, input, config, SpeechTranscriptionMode::Async)
        .expect("async transcription input should resolve in tests")
}

fn resolve_transcription_input_for_mode(
    provider_id: &str,
    mut input: TranscriptionInput,
    config: Option<crate::providers::ProviderConfig>,
    mode: SpeechTranscriptionMode,
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
        if model_capability(provider_id, &model, mode).is_some() {
            input.model = Some(model);
        } else if let Some(default_model) = default_model_for_mode(provider_id, mode) {
            input.model = Some(default_model.model_id.to_string());
        }
    } else if let Some(default_model) = default_model_for_mode(provider_id, mode) {
        input.model = Some(default_model.model_id.to_string());
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
        input.prompt = Some(prompts::default_transcription_prompt().to_string());
    }

    Ok(input)
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

    model_capability(provider_id, model, SpeechTranscriptionMode::Async)
        .map(|capability| capability.supports_prompt_or_keyterms)
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
                    api_version: Some("2025-04-01-preview".to_string()),
                    model: None,
                    transcription_mode: None,
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
                api_version: None,
                model: Some("pulse".to_string()),
                transcription_mode: None,
            }),
        );

        assert_eq!(resolved.model.as_deref(), Some("pulse"));
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
                api_version: None,
                model: Some("universal-3-pro".to_string()),
                transcription_mode: None,
            }),
        );

        assert_eq!(resolved.model.as_deref(), Some("universal-3-pro"));
    }

    #[test]
    fn assemblyai_registry_separates_async_and_streaming_models() {
        let async_model = model_capability(
            assemblyai::PROVIDER_ID,
            "universal-3-pro",
            SpeechTranscriptionMode::Async,
        )
        .expect("assemblyai async model");
        let streaming_model = model_capability(
            assemblyai::PROVIDER_ID,
            "u3-rt-pro",
            SpeechTranscriptionMode::Streaming,
        )
        .expect("assemblyai streaming model");

        assert_eq!(async_model.audio_profile_id, "assemblyai-async-file");
        assert_eq!(
            streaming_model.audio_profile_id,
            "assemblyai-streaming-pcm16-16khz"
        );
        assert!(async_model.default_for_mode);
        assert!(streaming_model.default_for_mode);
    }

    #[test]
    fn async_resolution_falls_back_when_saved_model_is_streaming_only() {
        let input = TranscriptionInput {
            audio: vec![1],
            mime_type: "audio/webm".to_string(),
            language: None,
            prompt: None,
            model: None,
        };

        let resolved = resolve_transcription_input_for_mode(
            assemblyai::PROVIDER_ID,
            input,
            Some(ProviderConfig {
                endpoint: None,
                deployment_id: None,
                api_version: None,
                model: Some("u3-rt-pro".to_string()),
                transcription_mode: None,
            }),
            SpeechTranscriptionMode::Async,
        )
        .expect("resolved async model");

        assert_eq!(resolved.model.as_deref(), Some("universal-3-pro"));
    }

    #[test]
    fn explicit_streaming_model_is_rejected_for_async_transcription() {
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
            SpeechTranscriptionMode::Async,
        )
        .expect_err("streaming-only model should not resolve for async");

        assert_eq!(err.code, "invalid_provider_request");
        assert!(err.message.contains("does not support async transcription"));
    }

    #[test]
    fn openai_realtime_transcription_model_is_streaming_capable() {
        let capability = model_capability(
            openai::PROVIDER_ID,
            "gpt-realtime-whisper",
            SpeechTranscriptionMode::Streaming,
        )
        .expect("openai realtime model");

        assert_eq!(capability.audio_profile_id, "openai-realtime-pcm-24khz");
        assert!(capability.supports_final_results);
        assert!(capability.supports_partial_results);
    }
}

fn validate_model_for_mode(
    provider_id: &str,
    model: Option<&str>,
    mode: SpeechTranscriptionMode,
) -> Result<(), ProviderError> {
    let Some(model) = model.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(());
    };

    if model_capability(provider_id, model, mode).is_some() {
        return Ok(());
    }

    Err(ProviderFailure::InvalidRequest(format!(
        "{provider_id} model {model} does not support {} transcription",
        mode.as_str()
    ))
    .into())
}

fn model_capability(
    provider_id: &str,
    model_id: &str,
    mode: SpeechTranscriptionMode,
) -> Option<&'static SpeechModelCapability> {
    SPEECH_MODEL_CAPABILITIES.iter().find(|capability| {
        capability.provider_id == provider_id
            && capability.model_id == model_id
            && capability.mode == mode
    })
}

fn default_model_for_mode(
    provider_id: &str,
    mode: SpeechTranscriptionMode,
) -> Option<&'static SpeechModelCapability> {
    SPEECH_MODEL_CAPABILITIES.iter().find(|capability| {
        capability.provider_id == provider_id
            && capability.mode == mode
            && capability.default_for_mode
    })
}

const SPEECH_MODEL_CAPABILITIES: &[SpeechModelCapability] = &[
    SpeechModelCapability {
        provider_id: openai::PROVIDER_ID,
        model_id: "gpt-4o-mini-transcribe",
        mode: SpeechTranscriptionMode::Async,
        default_for_mode: true,
        audio_profile_id: "openai-async-file",
        supports_language_hint: true,
        supports_prompt_or_keyterms: true,
        supports_partial_results: false,
        supports_final_results: true,
        retry_class: "http-file",
        billing_mode: "audio_duration",
    },
    SpeechModelCapability {
        provider_id: openai::PROVIDER_ID,
        model_id: "gpt-4o-transcribe",
        mode: SpeechTranscriptionMode::Async,
        default_for_mode: false,
        audio_profile_id: "openai-async-file",
        supports_language_hint: true,
        supports_prompt_or_keyterms: true,
        supports_partial_results: false,
        supports_final_results: true,
        retry_class: "http-file",
        billing_mode: "audio_duration",
    },
    SpeechModelCapability {
        provider_id: openai::PROVIDER_ID,
        model_id: "gpt-4o-transcribe-latest",
        mode: SpeechTranscriptionMode::Async,
        default_for_mode: false,
        audio_profile_id: "openai-async-file",
        supports_language_hint: true,
        supports_prompt_or_keyterms: true,
        supports_partial_results: false,
        supports_final_results: true,
        retry_class: "http-file",
        billing_mode: "audio_duration",
    },
    SpeechModelCapability {
        provider_id: openai::PROVIDER_ID,
        model_id: "gpt-4o-transcribe-diarize",
        mode: SpeechTranscriptionMode::Async,
        default_for_mode: false,
        audio_profile_id: "openai-async-file",
        supports_language_hint: true,
        supports_prompt_or_keyterms: false,
        supports_partial_results: false,
        supports_final_results: true,
        retry_class: "http-file",
        billing_mode: "audio_duration",
    },
    SpeechModelCapability {
        provider_id: openai::PROVIDER_ID,
        model_id: "whisper-1",
        mode: SpeechTranscriptionMode::Async,
        default_for_mode: false,
        audio_profile_id: "openai-async-file",
        supports_language_hint: true,
        supports_prompt_or_keyterms: true,
        supports_partial_results: false,
        supports_final_results: true,
        retry_class: "http-file",
        billing_mode: "audio_duration",
    },
    SpeechModelCapability {
        provider_id: openai::PROVIDER_ID,
        model_id: "gpt-realtime-whisper",
        mode: SpeechTranscriptionMode::Streaming,
        default_for_mode: true,
        audio_profile_id: "openai-realtime-pcm-24khz",
        supports_language_hint: true,
        supports_prompt_or_keyterms: false,
        supports_partial_results: true,
        supports_final_results: true,
        retry_class: "websocket-session",
        billing_mode: "session_duration",
    },
    SpeechModelCapability {
        provider_id: assemblyai::PROVIDER_ID,
        model_id: "universal-3-pro",
        mode: SpeechTranscriptionMode::Async,
        default_for_mode: true,
        audio_profile_id: "assemblyai-async-file",
        supports_language_hint: true,
        supports_prompt_or_keyterms: false,
        supports_partial_results: false,
        supports_final_results: true,
        retry_class: "http-async-job",
        billing_mode: "audio_duration",
    },
    SpeechModelCapability {
        provider_id: assemblyai::PROVIDER_ID,
        model_id: "universal-2",
        mode: SpeechTranscriptionMode::Async,
        default_for_mode: false,
        audio_profile_id: "assemblyai-async-file",
        supports_language_hint: true,
        supports_prompt_or_keyterms: false,
        supports_partial_results: false,
        supports_final_results: true,
        retry_class: "http-async-job",
        billing_mode: "audio_duration",
    },
    SpeechModelCapability {
        provider_id: assemblyai::PROVIDER_ID,
        model_id: "u3-rt-pro",
        mode: SpeechTranscriptionMode::Streaming,
        default_for_mode: true,
        audio_profile_id: "assemblyai-streaming-pcm16-16khz",
        supports_language_hint: true,
        supports_prompt_or_keyterms: true,
        supports_partial_results: true,
        supports_final_results: true,
        retry_class: "websocket-session",
        billing_mode: "session_duration",
    },
    SpeechModelCapability {
        provider_id: deepgram::PROVIDER_ID,
        model_id: "nova-3",
        mode: SpeechTranscriptionMode::Async,
        default_for_mode: true,
        audio_profile_id: "deepgram-async-file",
        supports_language_hint: true,
        supports_prompt_or_keyterms: false,
        supports_partial_results: false,
        supports_final_results: true,
        retry_class: "http-file",
        billing_mode: "audio_duration",
    },
    SpeechModelCapability {
        provider_id: elevenlabs::PROVIDER_ID,
        model_id: "scribe_v2",
        mode: SpeechTranscriptionMode::Async,
        default_for_mode: true,
        audio_profile_id: "elevenlabs-async-file",
        supports_language_hint: true,
        supports_prompt_or_keyterms: false,
        supports_partial_results: false,
        supports_final_results: true,
        retry_class: "http-file",
        billing_mode: "audio_duration",
    },
    SpeechModelCapability {
        provider_id: elevenlabs::PROVIDER_ID,
        model_id: "scribe_v1",
        mode: SpeechTranscriptionMode::Async,
        default_for_mode: false,
        audio_profile_id: "elevenlabs-async-file",
        supports_language_hint: true,
        supports_prompt_or_keyterms: false,
        supports_partial_results: false,
        supports_final_results: true,
        retry_class: "http-file",
        billing_mode: "audio_duration",
    },
    SpeechModelCapability {
        provider_id: smallest::PROVIDER_ID,
        model_id: "pulse",
        mode: SpeechTranscriptionMode::Async,
        default_for_mode: true,
        audio_profile_id: "smallest-async-file",
        supports_language_hint: true,
        supports_prompt_or_keyterms: false,
        supports_partial_results: false,
        supports_final_results: true,
        retry_class: "http-file",
        billing_mode: "audio_duration",
    },
];
