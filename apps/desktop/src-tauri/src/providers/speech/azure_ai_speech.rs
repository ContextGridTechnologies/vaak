use async_trait::async_trait;
use reqwest::header::{HeaderName, ACCEPT, CONTENT_TYPE};
use serde::Deserialize;

use crate::providers::errors::{ProviderError, ProviderFailure};
use crate::providers::speech::SpeechProvider;
use crate::providers::{
    build_http_client, normalize_provider_config, send_provider_request_with_retry, ProviderConfig,
    TranscriptResult, TranscriptionInput,
};

pub const PROVIDER_ID: &str = "azure-ai-speech";
const SHORT_AUDIO_RECOGNITION_PATH: &str =
    "/stt/speech/recognition/conversation/cognitiveservices/v1";
const DEFAULT_LANGUAGE: &str = "en-US";
const MAX_SHORT_AUDIO_BYTES: usize = 2 * 1024 * 1024;

pub struct AzureAiSpeechProvider {
    endpoint: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct AzureAiSpeechRecognitionResponse {
    recognition_status: String,
    display_text: Option<String>,
    duration: Option<u64>,
}

impl AzureAiSpeechProvider {
    pub fn new(config: ProviderConfig) -> Result<Self, ProviderError> {
        let normalized = normalize_provider_config(PROVIDER_ID, config)?;
        let endpoint = normalized.endpoint.ok_or_else(|| {
            ProviderFailure::InvalidRequest("Azure AI Speech endpoint is required".to_string())
        })?;

        Ok(Self { endpoint })
    }

    pub fn config_complete(config: &ProviderConfig) -> bool {
        config
            .endpoint
            .as_deref()
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false)
    }

    fn recognition_url(&self, language: Option<&str>) -> String {
        let language = language
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(DEFAULT_LANGUAGE);

        format!(
            "{}{}?language={}",
            self.endpoint, SHORT_AUDIO_RECOGNITION_PATH, language
        )
    }
}

#[async_trait]
impl SpeechProvider for AzureAiSpeechProvider {
    async fn transcribe(
        &self,
        api_key: String,
        input: TranscriptionInput,
    ) -> Result<TranscriptResult, ProviderError> {
        validate_input(&input)?;

        let client = build_http_client()?;
        let url = self.recognition_url(input.language.as_deref());
        let content_type = content_type_for_mime(&input.mime_type)?;
        let response = send_provider_request_with_retry(&client, "Azure AI Speech", || {
            build_recognition_request(&client, &url, &api_key, &input.audio, content_type)
        })
        .await?;
        let timing = response.timing.clone();

        let payload = response
            .json::<AzureAiSpeechRecognitionResponse>()
            .await
            .map_err(|_| ProviderFailure::InvalidResponse)?;
        let mut result = resolve_recognition_response(payload)?;
        result.provider_request_started_at = Some(timing.started_at);
        result.provider_response_received_at = Some(timing.completed_at);
        Ok(result)
    }
}

fn validate_input(input: &TranscriptionInput) -> Result<(), ProviderError> {
    if input.audio.is_empty() {
        return Err(ProviderFailure::InvalidRequest("audio is empty".to_string()).into());
    }
    if input.audio.len() > MAX_SHORT_AUDIO_BYTES {
        return Err(ProviderFailure::InvalidRequest(
            "Azure AI Speech short audio is limited to 60 seconds".to_string(),
        )
        .into());
    }

    content_type_for_mime(&input.mime_type)?;
    Ok(())
}

fn build_recognition_request(
    client: &reqwest::Client,
    url: &str,
    api_key: &str,
    audio: &[u8],
    content_type: &str,
) -> Result<reqwest::Request, ProviderError> {
    client
        .post(url)
        .header(subscription_key_header(), api_key)
        .header(ACCEPT, "application/json")
        .header(CONTENT_TYPE, content_type)
        .body(audio.to_vec())
        .build()
        .map_err(ProviderError::from)
}

fn content_type_for_mime(mime_type: &str) -> Result<&'static str, ProviderError> {
    match mime_type {
        "audio/wav" | "audio/x-wav" => Ok("audio/wav; codecs=audio/pcm; samplerate=16000"),
        "audio/ogg" => Ok("audio/ogg; codecs=opus"),
        _ => Err(ProviderFailure::InvalidRequest(
            "Azure AI Speech short audio supports WAV PCM or OGG Opus".to_string(),
        )
        .into()),
    }
}

fn resolve_recognition_response(
    payload: AzureAiSpeechRecognitionResponse,
) -> Result<TranscriptResult, ProviderError> {
    match payload.recognition_status.as_str() {
        "Success" => {
            let text = payload
                .display_text
                .ok_or(ProviderFailure::InvalidResponse)?;
            if text.trim().is_empty() {
                return Err(ProviderFailure::InvalidResponse.into());
            }

            Ok(TranscriptResult {
                provider_id: PROVIDER_ID.to_string(),
                model: "azure-ai-speech-short-audio".to_string(),
                text,
                duration_ms: payload.duration.map(azure_ticks_to_millis),
                provider_request_started_at: None,
                provider_response_received_at: None,
                provider_events: Vec::new(),
            })
        }
        "NoMatch" => Ok(TranscriptResult {
            provider_id: PROVIDER_ID.to_string(),
            model: "azure-ai-speech-short-audio".to_string(),
            text: String::new(),
            duration_ms: payload.duration.map(azure_ticks_to_millis),
            provider_request_started_at: None,
            provider_response_received_at: None,
            provider_events: Vec::new(),
        }),
        _ => Err(ProviderFailure::InvalidResponse.into()),
    }
}

fn azure_ticks_to_millis(ticks: u64) -> u64 {
    ticks / 10_000
}

fn subscription_key_header() -> HeaderName {
    HeaderName::from_static("ocp-apim-subscription-key")
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::header::{ACCEPT, CONTENT_TYPE};

    #[test]
    fn builds_recognition_url_with_default_language() {
        let provider = AzureAiSpeechProvider::new(ProviderConfig {
            endpoint: Some("https://example.cognitiveservices.azure.com/".to_string()),
            deployment_id: None,
            streaming_deployment_id: None,
            api_version: None,
            model: None,
            transcription_mode: None,
        })
        .expect("valid config");

        assert_eq!(
            provider.recognition_url(None),
            "https://example.cognitiveservices.azure.com/stt/speech/recognition/conversation/cognitiveservices/v1?language=en-US"
        );
    }

    #[test]
    fn builds_recognition_request_with_subscription_key_and_audio_body() {
        let client = reqwest::Client::new();
        let request = build_recognition_request(
            &client,
            "https://example.cognitiveservices.azure.com/stt/speech/recognition/conversation/cognitiveservices/v1?language=hi-IN",
            "azure-speech-key",
            &[1, 2, 3],
            "audio/wav; codecs=audio/pcm; samplerate=16000",
        )
        .expect("request builds");

        assert_eq!(
            request.url().as_str(),
            "https://example.cognitiveservices.azure.com/stt/speech/recognition/conversation/cognitiveservices/v1?language=hi-IN"
        );
        assert_eq!(
            request
                .headers()
                .get(subscription_key_header())
                .and_then(|value| value.to_str().ok()),
            Some("azure-speech-key")
        );
        assert_eq!(
            request
                .headers()
                .get(ACCEPT)
                .and_then(|value| value.to_str().ok()),
            Some("application/json")
        );
        assert_eq!(
            request
                .headers()
                .get(CONTENT_TYPE)
                .and_then(|value| value.to_str().ok()),
            Some("audio/wav; codecs=audio/pcm; samplerate=16000")
        );
        assert_eq!(
            request.body().and_then(reqwest::Body::as_bytes),
            Some(&[1, 2, 3][..])
        );
    }

    #[test]
    fn maps_supported_mime_types_to_azure_content_types() {
        assert_eq!(
            content_type_for_mime("audio/wav").unwrap(),
            "audio/wav; codecs=audio/pcm; samplerate=16000"
        );
        assert_eq!(
            content_type_for_mime("audio/ogg").unwrap(),
            "audio/ogg; codecs=opus"
        );
    }

    #[test]
    fn rejects_unsupported_webm_input() {
        let err = validate_input(&TranscriptionInput {
            audio: vec![1],
            mime_type: "audio/webm".to_string(),
            language: None,
            prompt: None,
            model: None,
        })
        .expect_err("webm is not accepted by Azure AI Speech short audio");

        assert_eq!(err.code, "invalid_provider_request");
    }

    #[test]
    fn rejects_audio_over_short_audio_limit() {
        let err = validate_input(&TranscriptionInput {
            audio: vec![1; MAX_SHORT_AUDIO_BYTES + 1],
            mime_type: "audio/wav".to_string(),
            language: None,
            prompt: None,
            model: None,
        })
        .expect_err("oversized audio should fail");

        assert_eq!(err.code, "invalid_provider_request");
        assert!(err.message.contains("60 seconds"));
    }

    #[test]
    fn success_response_maps_display_text_and_duration() {
        let result = resolve_recognition_response(AzureAiSpeechRecognitionResponse {
            recognition_status: "Success".to_string(),
            display_text: Some("hello from azure speech".to_string()),
            duration: Some(12_300_000),
        })
        .expect("success maps");

        assert_eq!(result.provider_id, PROVIDER_ID);
        assert_eq!(result.model, "azure-ai-speech-short-audio");
        assert_eq!(result.text, "hello from azure speech");
        assert_eq!(result.duration_ms, Some(1_230));
    }

    #[test]
    fn no_match_response_returns_empty_transcript() {
        let result = resolve_recognition_response(AzureAiSpeechRecognitionResponse {
            recognition_status: "NoMatch".to_string(),
            display_text: None,
            duration: Some(10_000),
        })
        .expect("no match is a no-op transcript");

        assert_eq!(result.text, "");
        assert_eq!(result.duration_ms, Some(1));
    }

    #[test]
    fn blank_success_text_is_invalid() {
        let err = resolve_recognition_response(AzureAiSpeechRecognitionResponse {
            recognition_status: "Success".to_string(),
            display_text: Some("   ".to_string()),
            duration: None,
        })
        .expect_err("blank success should fail");

        assert_eq!(err.code, "invalid_provider_response");
    }
}
