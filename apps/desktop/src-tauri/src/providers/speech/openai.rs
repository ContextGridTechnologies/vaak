use async_trait::async_trait;
use reqwest::multipart::{Form, Part};
use serde::Deserialize;

use crate::providers::errors::{ProviderError, ProviderFailure};
use crate::providers::speech::SpeechProvider;
use crate::providers::{TranscriptResult, TranscriptionInput};

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
        let file = Part::bytes(input.audio)
            .file_name(file_name_for_mime(&input.mime_type))
            .mime_str(&input.mime_type)
            .map_err(|err| ProviderFailure::InvalidRequest(err.to_string()))?;
        let mut form = Form::new()
            .part("file", file)
            .text("model", model.clone())
            .text("response_format", "json");

        if let Some(language) = input.language.filter(|value| !value.trim().is_empty()) {
            form = form.text("language", language);
        }
        if let Some(prompt) = input.prompt.filter(|value| !value.trim().is_empty()) {
            form = form.text("prompt", prompt);
        }

        let response = reqwest::Client::new()
            .post(TRANSCRIPTIONS_URL)
            .bearer_auth(api_key)
            .multipart(form)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(
                ProviderFailure::Request(format!("OpenAI returned {status}: {body}")).into(),
            );
        }

        let payload = response.json::<OpenAiTranscriptionResponse>().await?;
        if payload.text.trim().is_empty() {
            return Err(ProviderFailure::InvalidResponse.into());
        }

        Ok(TranscriptResult {
            provider_id: PROVIDER_ID.to_string(),
            model,
            text: payload.text,
            duration_ms: None,
        })
    }
}

fn file_name_for_mime(mime_type: &str) -> &'static str {
    match mime_type {
        "audio/wav" => "recording.wav",
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
    fn selects_extension_from_mime_type() {
        assert_eq!(file_name_for_mime("audio/wav"), "recording.wav");
        assert_eq!(file_name_for_mime("audio/webm"), "recording.webm");
        assert_eq!(
            file_name_for_mime("application/octet-stream"),
            "recording.webm"
        );
    }
}
