use async_trait::async_trait;
use reqwest::multipart::{Form, Part};
use serde::Deserialize;

use crate::providers::errors::{ProviderError, ProviderFailure};
use crate::providers::speech::SpeechProvider;
use crate::providers::{
    build_http_client, send_provider_request_with_retry, TranscriptResult, TranscriptionInput,
};

pub const PROVIDER_ID: &str = "openai";
const DEFAULT_MODEL: &str = "gpt-4o-mini-transcribe";
const TRANSCRIPTIONS_URL: &str = "https://api.openai.com/v1/audio/transcriptions";
const MAX_AUDIO_BYTES: usize = 25 * 1024 * 1024;

#[derive(Default)]
pub struct OpenAiSpeechProvider;

#[derive(Deserialize)]
struct OpenAiTranscriptionResponse {
    text: String,
}

#[async_trait]
impl SpeechProvider for OpenAiSpeechProvider {
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

        let model = input
            .model
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_MODEL.to_string());
        let client = build_http_client()?;
        let response = send_provider_request_with_retry(&client, "OpenAI", || {
            build_transcription_request(
                &client,
                &api_key,
                &input.audio,
                &input.mime_type,
                &model,
                input.language.as_deref(),
                input.prompt.as_deref(),
            )
        })
        .await?;
        let timing = response.timing.clone();

        let payload = response.json::<OpenAiTranscriptionResponse>().await?;
        if payload.text.trim().is_empty() {
            return Err(ProviderFailure::InvalidResponse.into());
        }

        Ok(TranscriptResult {
            provider_id: PROVIDER_ID.to_string(),
            model,
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
    api_key: &str,
    audio: &[u8],
    mime_type: &str,
    model: &str,
    language: Option<&str>,
    prompt: Option<&str>,
) -> Result<reqwest::Request, ProviderError> {
    let file = Part::bytes(audio.to_vec())
        .file_name(file_name_for_mime(mime_type))
        .mime_str(mime_type)
        .map_err(|err| ProviderFailure::InvalidRequest(err.to_string()))?;
    let mut form = Form::new()
        .part("file", file)
        .text("model", model.to_string())
        .text("response_format", "json");

    if let Some(language) = language.map(str::trim).filter(|value| !value.is_empty()) {
        form = form.text("language", language.to_string());
    }
    if let Some(prompt) = prompt.map(str::trim).filter(|value| !value.is_empty()) {
        form = form.text("prompt", prompt.to_string());
    }

    client
        .post(TRANSCRIPTIONS_URL)
        .bearer_auth(api_key)
        .multipart(form)
        .build()
        .map_err(ProviderError::from)
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
    use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};

    #[test]
    fn selects_extension_from_mime_type() {
        assert_eq!(file_name_for_mime("audio/wav"), "recording.wav");
        assert_eq!(file_name_for_mime("audio/flac"), "recording.flac");
        assert_eq!(file_name_for_mime("audio/webm"), "recording.webm");
        assert_eq!(
            file_name_for_mime("application/octet-stream"),
            "recording.webm"
        );
    }

    #[test]
    fn request_uses_transcription_endpoint_auth_and_multipart_body() {
        let client = reqwest::Client::new();
        let request = build_transcription_request(
            &client,
            "openai-test",
            &[1, 2, 3],
            "audio/webm",
            "gpt-4o-mini-transcribe",
            Some("en"),
            Some("domain terms"),
        )
        .expect("request to build");

        assert_eq!(request.url().as_str(), TRANSCRIPTIONS_URL);
        assert_eq!(
            request
                .headers()
                .get(AUTHORIZATION)
                .and_then(|value| value.to_str().ok()),
            Some("Bearer openai-test")
        );
        assert!(request
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .starts_with("multipart/form-data; boundary="));
    }
}
