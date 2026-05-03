use async_trait::async_trait;
use reqwest::header::CONTENT_TYPE;
use serde::Deserialize;

use crate::providers::errors::{ProviderError, ProviderFailure};
use crate::providers::speech::SpeechProvider;
use crate::providers::{TranscriptResult, TranscriptionInput};

pub const PROVIDER_ID: &str = "smallest";
pub const DEFAULT_MODEL: &str = "pulse";

const TRANSCRIPTIONS_URL: &str = "https://api.smallest.ai/waves/v1/pulse/get_text";
const DEFAULT_LANGUAGE: &str = "multi";

#[derive(Default)]
pub struct SmallestSpeechProvider;

#[derive(Debug, Deserialize)]
struct SmallestTranscriptionResponse {
    transcription: Option<String>,
    audio_length: Option<f64>,
}

#[async_trait]
impl SpeechProvider for SmallestSpeechProvider {
    async fn transcribe(
        &self,
        api_key: String,
        input: TranscriptionInput,
    ) -> Result<TranscriptResult, ProviderError> {
        validate_input(&input)?;

        let model = resolve_model(input.model.as_deref()).to_string();
        let client = reqwest::Client::new();
        let response = client
            .execute(build_transcription_request(
                &client,
                &api_key,
                &input.audio,
                &input.mime_type,
                input.language.as_deref(),
            )?)
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(request_failure(status, &body));
        }

        let payload = response.json::<SmallestTranscriptionResponse>().await?;
        resolve_transcription_response(payload, &model)
    }
}

fn validate_input(input: &TranscriptionInput) -> Result<(), ProviderError> {
    if input.audio.is_empty() {
        return Err(ProviderFailure::InvalidRequest("audio is empty".to_string()).into());
    }

    Ok(())
}

fn resolve_model(model: Option<&str>) -> &str {
    model
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_MODEL)
}

fn resolve_language(language: Option<&str>) -> &str {
    language
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_LANGUAGE)
}

fn build_transcription_request(
    client: &reqwest::Client,
    api_key: &str,
    audio: &[u8],
    mime_type: &str,
    language: Option<&str>,
) -> Result<reqwest::Request, ProviderError> {
    client
        .post(TRANSCRIPTIONS_URL)
        .bearer_auth(api_key)
        .header(CONTENT_TYPE, mime_type)
        .query(&[
            ("language", resolve_language(language)),
            ("word_timestamps", "false"),
            ("format", "true"),
            ("punctuate", "true"),
            ("capitalize", "true"),
        ])
        .body(audio.to_vec())
        .build()
        .map_err(ProviderError::from)
}

fn resolve_transcription_response(
    payload: SmallestTranscriptionResponse,
    model: &str,
) -> Result<TranscriptResult, ProviderError> {
    let text = payload.transcription.unwrap_or_default();
    if text.trim().is_empty() {
        return Err(ProviderFailure::InvalidResponse.into());
    }

    Ok(TranscriptResult {
        provider_id: PROVIDER_ID.to_string(),
        model: model.to_string(),
        text,
        duration_ms: payload.audio_length.and_then(seconds_to_millis),
    })
}

fn request_failure(status: reqwest::StatusCode, body: &str) -> ProviderError {
    ProviderFailure::Request(format!("Smallest AI returned {status}: {body}")).into()
}

fn seconds_to_millis(seconds: f64) -> Option<u64> {
    if !seconds.is_finite() || seconds < 0.0 {
        return None;
    }

    Some((seconds * 1000.0).round() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};

    #[test]
    fn request_uses_pulse_endpoint_auth_audio_and_query_parameters() {
        let client = reqwest::Client::new();
        let request = build_transcription_request(
            &client,
            "smallest-test",
            &[1, 2, 3],
            "audio/flac",
            Some("en"),
        )
        .expect("request to build");

        assert_eq!(
            request.url().as_str(),
            "https://api.smallest.ai/waves/v1/pulse/get_text?language=en&word_timestamps=false&format=true&punctuate=true&capitalize=true"
        );
        assert_eq!(
            request
                .headers()
                .get(AUTHORIZATION)
                .and_then(|value| value.to_str().ok()),
            Some("Bearer smallest-test")
        );
        assert_eq!(
            request
                .headers()
                .get(CONTENT_TYPE)
                .and_then(|value| value.to_str().ok()),
            Some("audio/flac")
        );
        assert_eq!(
            request.body().and_then(reqwest::Body::as_bytes),
            Some(&[1, 2, 3][..])
        );
    }

    #[test]
    fn request_defaults_missing_language_to_multi() {
        let client = reqwest::Client::new();
        let request =
            build_transcription_request(&client, "smallest-test", &[1], "audio/webm", None)
                .expect("request to build");

        assert_eq!(
            request.url().query(),
            Some("language=multi&word_timestamps=false&format=true&punctuate=true&capitalize=true")
        );
    }

    #[test]
    fn empty_audio_is_an_invalid_request() {
        let input = crate::providers::TranscriptionInput {
            audio: Vec::new(),
            mime_type: "audio/webm".to_string(),
            language: None,
            prompt: None,
            model: None,
        };

        let err = validate_input(&input).expect_err("empty audio should fail");

        assert_eq!(err.code, "invalid_provider_request");
        assert_eq!(err.message, "audio is empty");
    }

    #[test]
    fn successful_response_maps_transcription_and_duration() {
        let result = resolve_transcription_response(
            SmallestTranscriptionResponse {
                transcription: Some("hello from pulse".to_string()),
                audio_length: Some(2.5),
            },
            "pulse",
        )
        .expect("valid response");

        assert_eq!(result.provider_id, "smallest");
        assert_eq!(result.model, "pulse");
        assert_eq!(result.text, "hello from pulse");
        assert_eq!(result.duration_ms, Some(2_500));
    }

    #[test]
    fn blank_transcription_is_an_invalid_provider_response() {
        let err = resolve_transcription_response(
            SmallestTranscriptionResponse {
                transcription: Some("   ".to_string()),
                audio_length: Some(1.0),
            },
            "pulse",
        )
        .expect_err("blank transcript should fail");

        assert_eq!(err.code, "invalid_provider_response");
    }

    #[test]
    fn non_success_response_surfaces_status_and_body() {
        let err = request_failure(reqwest::StatusCode::UNAUTHORIZED, "invalid key");

        assert_eq!(err.code, "provider_request_failed");
        assert_eq!(
            err.message,
            "Smallest AI returned 401 Unauthorized: invalid key"
        );
    }
}
