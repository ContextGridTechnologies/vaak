use async_trait::async_trait;
use reqwest::multipart::{Form, Part};
use serde::Deserialize;

use crate::providers::errors::{ProviderError, ProviderFailure};
use crate::providers::speech::SpeechProvider;
use crate::providers::{
    build_http_client, normalize_provider_config, send_provider_request_with_retry, ProviderConfig,
    TranscriptResult, TranscriptionInput,
};

pub const PROVIDER_ID: &str = "azure-openai";
const DEFAULT_API_VERSION: &str = "2025-04-01-preview";
const MAX_AUDIO_BYTES: usize = 25 * 1024 * 1024;

pub struct AzureOpenAiSpeechProvider {
    endpoint: String,
    deployment_id: String,
    api_version: String,
}

#[derive(Deserialize)]
struct AzureTranscriptionResponse {
    text: String,
}

impl AzureOpenAiSpeechProvider {
    pub fn new(config: ProviderConfig) -> Result<Self, ProviderError> {
        let normalized = normalize_provider_config(PROVIDER_ID, config)?;
        let endpoint = normalized.endpoint.ok_or_else(|| {
            ProviderFailure::InvalidRequest("Azure OpenAI endpoint is required".to_string())
        })?;
        let deployment_id = normalized.deployment_id.ok_or_else(|| {
            ProviderFailure::InvalidRequest("Azure OpenAI deployment id is required".to_string())
        })?;
        let api_version = normalized
            .api_version
            .unwrap_or_else(|| DEFAULT_API_VERSION.to_string());

        Ok(Self {
            endpoint,
            deployment_id,
            api_version,
        })
    }

    pub fn config_complete(config: &ProviderConfig) -> bool {
        config
            .endpoint
            .as_deref()
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false)
            && config
                .deployment_id
                .as_deref()
                .map(|value| !value.trim().is_empty())
                .unwrap_or(false)
    }

    fn transcription_url(&self) -> String {
        format!(
            "{}/openai/deployments/{}/audio/transcriptions?api-version={}",
            self.endpoint, self.deployment_id, self.api_version
        )
    }
}

#[async_trait]
impl SpeechProvider for AzureOpenAiSpeechProvider {
    async fn transcribe(
        &self,
        api_key: String,
        input: TranscriptionInput,
    ) -> Result<TranscriptResult, ProviderError> {
        if input.audio.is_empty() {
            return Err(ProviderFailure::InvalidRequest("audio is empty".to_string()).into());
        }
        if input.audio.len() > MAX_AUDIO_BYTES {
            return Err(ProviderFailure::AudioTooLarge.into());
        }

        let client = build_http_client()?;
        let url = self.transcription_url();
        let response = send_provider_request_with_retry(&client, "Azure OpenAI", || {
            build_transcription_request(
                &client,
                &url,
                &api_key,
                &input.audio,
                &input.mime_type,
                input.language.as_deref(),
                input.prompt.as_deref(),
            )
        })
        .await?;
        let timing = response.timing.clone();

        let body = response.text().await?;
        let payload = parse_transcription_response(&body)?;
        if payload.text.trim().is_empty() {
            return Err(ProviderFailure::InvalidResponse.into());
        }

        Ok(TranscriptResult {
            provider_id: PROVIDER_ID.to_string(),
            model: self.deployment_id.clone(),
            text: payload.text,
            duration_ms: None,
            provider_request_started_at: Some(timing.started_at),
            provider_response_received_at: Some(timing.completed_at),
            provider_events: Vec::new(),
        })
    }
}

fn build_transcription_request(
    client: &reqwest::Client,
    url: &str,
    api_key: &str,
    audio: &[u8],
    mime_type: &str,
    language: Option<&str>,
    prompt: Option<&str>,
) -> Result<reqwest::Request, ProviderError> {
    let file = Part::bytes(audio.to_vec())
        .file_name(file_name_for_mime(mime_type))
        .mime_str(mime_type)
        .map_err(|err| ProviderFailure::InvalidRequest(err.to_string()))?;
    let mut form = Form::new()
        .part("file", file)
        .text("response_format", "json");

    if let Some(language) = language.map(str::trim).filter(|value| !value.is_empty()) {
        form = form.text("language", language.to_string());
    }
    if let Some(prompt) = prompt.map(str::trim).filter(|value| !value.is_empty()) {
        form = form.text("prompt", prompt.to_string());
    }

    client
        .post(url)
        .header("api-key", api_key)
        .multipart(form)
        .build()
        .map_err(ProviderError::from)
}

fn parse_transcription_response(body: &str) -> Result<AzureTranscriptionResponse, ProviderError> {
    serde_json::from_str::<AzureTranscriptionResponse>(body)
        .map_err(|_| ProviderFailure::InvalidResponse.into())
}

fn file_name_for_mime(mime_type: &str) -> &'static str {
    match mime_type {
        "audio/wav" => "recording.wav",
        "audio/flac" | "audio/x-flac" => "recording.flac",
        "audio/mpeg" | "audio/mp3" => "recording.mp3",
        "audio/mp4" => "recording.mp4",
        "audio/m4a" => "recording.m4a",
        "audio/webm" => "recording.webm",
        _ => "recording.webm",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::header::CONTENT_TYPE;

    #[test]
    fn builds_transcription_url() {
        let provider = AzureOpenAiSpeechProvider::new(ProviderConfig {
            endpoint: Some("https://example.openai.azure.com/".to_string()),
            deployment_id: Some("gpt-4o-mini-transcribe".to_string()),
            streaming_deployment_id: None,
            api_version: Some("2025-04-01-preview".to_string()),
            model: None,
            transcription_mode: None,
        })
        .expect("valid config");

        assert_eq!(
            provider.transcription_url(),
            "https://example.openai.azure.com/openai/deployments/gpt-4o-mini-transcribe/audio/transcriptions?api-version=2025-04-01-preview"
        );
    }

    #[test]
    fn builds_transcription_url_with_default_api_version() {
        let provider = AzureOpenAiSpeechProvider::new(ProviderConfig {
            endpoint: Some("https://example.openai.azure.com".to_string()),
            deployment_id: Some("gpt-4o-mini-transcribe".to_string()),
            streaming_deployment_id: None,
            api_version: None,
            model: None,
            transcription_mode: None,
        })
        .expect("valid config");

        assert_eq!(
            provider.transcription_url(),
            "https://example.openai.azure.com/openai/deployments/gpt-4o-mini-transcribe/audio/transcriptions?api-version=2025-04-01-preview"
        );
    }

    #[test]
    fn detects_incomplete_config() {
        assert!(!AzureOpenAiSpeechProvider::config_complete(
            &ProviderConfig {
                endpoint: Some("https://example.openai.azure.com".to_string()),
                deployment_id: None,
                streaming_deployment_id: None,
                api_version: None,
                model: None,
                transcription_mode: None,
            }
        ));
    }

    #[test]
    fn selects_flac_extension_from_mime_type() {
        assert_eq!(file_name_for_mime("audio/flac"), "recording.flac");
    }

    #[test]
    fn parses_complete_transcription_response_text() {
        let payload = r#"{"text":"When we play an audio, there is a three dots on which we can download the audio, but I'm not able to download it. Can you please help me download?","duration":8.3}"#;

        let parsed = parse_transcription_response(payload).expect("valid response");

        assert_eq!(
            parsed.text,
            "When we play an audio, there is a three dots on which we can download the audio, but I'm not able to download it. Can you please help me download?"
        );
    }

    #[test]
    fn request_uses_azure_url_api_key_and_multipart_body() {
        let client = reqwest::Client::new();
        let request = build_transcription_request(
            &client,
            "https://example.openai.azure.com/openai/deployments/whisper/audio/transcriptions?api-version=2025-04-01-preview",
            "azure-test",
            &[1, 2, 3],
            "audio/webm",
            Some("en"),
            Some("domain terms"),
        )
        .expect("request to build");

        assert_eq!(
            request.url().as_str(),
            "https://example.openai.azure.com/openai/deployments/whisper/audio/transcriptions?api-version=2025-04-01-preview"
        );
        assert_eq!(
            request
                .headers()
                .get("api-key")
                .and_then(|value| value.to_str().ok()),
            Some("azure-test")
        );
        assert!(request
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .starts_with("multipart/form-data; boundary="));
    }
}
