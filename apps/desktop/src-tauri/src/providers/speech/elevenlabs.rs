use async_trait::async_trait;
use reqwest::multipart::{Form, Part};
use serde::Deserialize;

use crate::providers::errors::{ProviderError, ProviderFailure};
use crate::providers::speech::SpeechProvider;
use crate::providers::{
    build_http_client, send_provider_request_with_retry, TranscriptResult, TranscriptionInput,
};

pub const PROVIDER_ID: &str = "elevenlabs";
const DEFAULT_MODEL: &str = "scribe_v2";
const TRANSCRIPTIONS_URL: &str = "https://api.elevenlabs.io/v1/speech-to-text";
const MAX_AUDIO_BYTES: usize = 3 * 1024 * 1024 * 1024;

#[derive(Default)]
pub struct ElevenLabsSpeechProvider;

#[derive(Deserialize)]
struct ElevenLabsTranscriptionResponse {
    text: String,
}

struct ElevenLabsRequest {
    url: &'static str,
    model_id: String,
    language_code: Option<String>,
    file_name: &'static str,
}

impl ElevenLabsRequest {
    fn from_input(input: TranscriptionInput) -> Result<Self, ProviderError> {
        if input.audio.is_empty() {
            return Err(ProviderFailure::InvalidRequest("audio is empty".to_string()).into());
        }
        if input.audio.len() > MAX_AUDIO_BYTES {
            return Err(ProviderFailure::InvalidRequest(
                "audio file is larger than 3 GB".to_string(),
            )
            .into());
        }

        Ok(Self {
            url: TRANSCRIPTIONS_URL,
            model_id: input
                .model
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| DEFAULT_MODEL.to_string()),
            language_code: input.language.filter(|value| !value.trim().is_empty()),
            file_name: file_name_for_mime(&input.mime_type),
        })
    }
}

#[async_trait]
impl SpeechProvider for ElevenLabsSpeechProvider {
    async fn transcribe(
        &self,
        api_key: String,
        input: TranscriptionInput,
    ) -> Result<TranscriptResult, ProviderError> {
        let request = ElevenLabsRequest::from_input(input.clone())?;
        let client = build_http_client()?;
        let response = send_provider_request_with_retry(&client, "ElevenLabs", || {
            build_transcription_request(&client, &api_key, &input.audio, &input.mime_type, &request)
        })
        .await?;
        let timing = response.timing.clone();

        let payload = response.json::<ElevenLabsTranscriptionResponse>().await?;
        if payload.text.trim().is_empty() {
            return Err(ProviderFailure::InvalidResponse.into());
        }

        Ok(TranscriptResult {
            provider_id: PROVIDER_ID.to_string(),
            model: request.model_id,
            text: payload.text,
            duration_ms: None,
            provider_request_started_at: Some(timing.started_at),
            provider_response_received_at: Some(timing.completed_at),
        })
    }
}

fn build_transcription_request(
    client: &reqwest::Client,
    api_key: &str,
    audio: &[u8],
    mime_type: &str,
    request: &ElevenLabsRequest,
) -> Result<reqwest::Request, ProviderError> {
    let file = Part::bytes(audio.to_vec())
        .file_name(request.file_name)
        .mime_str(mime_type)
        .map_err(|err| ProviderFailure::InvalidRequest(err.to_string()))?;
    let mut form = Form::new()
        .part("file", file)
        .text("model_id", request.model_id.clone());

    if let Some(language_code) = request.language_code.clone() {
        form = form.text("language_code", language_code);
    }

    client
        .post(request.url)
        .header("xi-api-key", api_key)
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
    use crate::providers::TranscriptionInput;
    use reqwest::header::CONTENT_TYPE;

    #[test]
    fn defaults_to_scribe_v2_request_values() {
        let request = ElevenLabsRequest::from_input(TranscriptionInput {
            audio: vec![1, 2, 3],
            mime_type: "audio/webm".to_string(),
            language: Some("en".to_string()),
            prompt: Some("domain terms".to_string()),
            model: None,
        })
        .expect("valid request");

        assert_eq!(request.url, "https://api.elevenlabs.io/v1/speech-to-text");
        assert_eq!(request.model_id, "scribe_v2");
        assert_eq!(request.language_code.as_deref(), Some("en"));
        assert_eq!(request.file_name, "recording.webm");
    }

    #[test]
    fn keeps_custom_model_and_m4a_extension() {
        let request = ElevenLabsRequest::from_input(TranscriptionInput {
            audio: vec![1, 2, 3],
            mime_type: "audio/m4a".to_string(),
            language: None,
            prompt: None,
            model: Some("scribe_v1".to_string()),
        })
        .expect("valid request");

        assert_eq!(request.model_id, "scribe_v1");
        assert_eq!(request.language_code, None);
        assert_eq!(request.file_name, "recording.m4a");
    }

    #[test]
    fn request_uses_speech_to_text_endpoint_api_key_and_multipart_body() {
        let client = reqwest::Client::new();
        let request_metadata = ElevenLabsRequest::from_input(TranscriptionInput {
            audio: vec![1, 2, 3],
            mime_type: "audio/webm".to_string(),
            language: Some("en".to_string()),
            prompt: None,
            model: None,
        })
        .expect("valid request metadata");
        let request = build_transcription_request(
            &client,
            "eleven-test",
            &[1, 2, 3],
            "audio/webm",
            &request_metadata,
        )
        .expect("request to build");

        assert_eq!(request.url().as_str(), TRANSCRIPTIONS_URL);
        assert_eq!(
            request
                .headers()
                .get("xi-api-key")
                .and_then(|value| value.to_str().ok()),
            Some("eleven-test")
        );
        assert!(request
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .starts_with("multipart/form-data; boundary="));
    }
}
