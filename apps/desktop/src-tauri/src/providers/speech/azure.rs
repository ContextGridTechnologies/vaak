use async_trait::async_trait;
use reqwest::multipart::{Form, Part};
use serde::Deserialize;

use crate::providers::errors::{ProviderError, ProviderFailure};
use crate::providers::speech::SpeechProvider;
use crate::providers::{ProviderConfig, TranscriptResult, TranscriptionInput};

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
        let endpoint = required_field(config.endpoint, "Azure OpenAI endpoint")?;
        let deployment_id = required_field(config.deployment_id, "Azure OpenAI deployment id")?;
        let api_version = config
            .api_version
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_API_VERSION.to_string());

        if !endpoint.starts_with("https://") && !endpoint.starts_with("http://") {
            return Err(ProviderFailure::InvalidRequest(
                "Azure OpenAI endpoint must start with http:// or https://".to_string(),
            )
            .into());
        }
        if deployment_id.contains('/') {
            return Err(ProviderFailure::InvalidRequest(
                "Azure OpenAI deployment id cannot contain /".to_string(),
            )
            .into());
        }

        Ok(Self {
            endpoint: endpoint.trim_end_matches('/').to_string(),
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

        let file = Part::bytes(input.audio)
            .file_name(file_name_for_mime(&input.mime_type))
            .mime_str(&input.mime_type)
            .map_err(|err| ProviderFailure::InvalidRequest(err.to_string()))?;
        let mut form = Form::new()
            .part("file", file)
            .text("response_format", "json");

        if let Some(language) = input.language.filter(|value| !value.trim().is_empty()) {
            form = form.text("language", language);
        }
        if let Some(prompt) = input.prompt.filter(|value| !value.trim().is_empty()) {
            form = form.text("prompt", prompt);
        }

        let response = reqwest::Client::new()
            .post(self.transcription_url())
            .header("api-key", api_key)
            .multipart(form)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(ProviderFailure::Request(format!(
                "Azure OpenAI returned {status}: {body}"
            ))
            .into());
        }

        let body = response.text().await?;
        log::info!(
            "[vaak][provider][azure-openai] transcription_response deployment_id={} body={}",
            self.deployment_id,
            body
        );

        let payload = parse_transcription_response(&body)?;
        if payload.text.trim().is_empty() {
            return Err(ProviderFailure::InvalidResponse.into());
        }

        Ok(TranscriptResult {
            provider_id: PROVIDER_ID.to_string(),
            model: self.deployment_id.clone(),
            text: payload.text,
            duration_ms: None,
        })
    }
}

fn parse_transcription_response(body: &str) -> Result<AzureTranscriptionResponse, ProviderError> {
    serde_json::from_str::<AzureTranscriptionResponse>(body).map_err(|err| {
        ProviderFailure::Request(format!(
            "failed to parse Azure OpenAI transcription response: {err}; body: {body}"
        ))
        .into()
    })
}

fn required_field(value: Option<String>, label: &str) -> Result<String, ProviderError> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| ProviderFailure::InvalidRequest(format!("{label} is required")).into())
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

    #[test]
    fn builds_transcription_url() {
        let provider = AzureOpenAiSpeechProvider::new(ProviderConfig {
            endpoint: Some("https://example.openai.azure.com/".to_string()),
            deployment_id: Some("gpt-4o-mini-transcribe".to_string()),
            api_version: Some("2025-04-01-preview".to_string()),
            model: None,
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
                api_version: None,
                model: None,
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
}
