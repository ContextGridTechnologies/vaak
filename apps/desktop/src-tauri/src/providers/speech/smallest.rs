use async_trait::async_trait;
use reqwest::header::CONTENT_TYPE;
use serde::Deserialize;
use serde_json::Value;

use crate::providers::errors::{ProviderError, ProviderFailure};
use crate::providers::speech::SpeechProvider;
use crate::providers::{
    build_http_client, send_provider_request_with_retry, TranscriptResult, TranscriptionInput,
};

pub const PROVIDER_ID: &str = "smallest";
pub const DEFAULT_MODEL: &str = "pulse";
const LOG_TARGET: &str = "vaak::providers::speech::smallest";

const TRANSCRIPTIONS_URL: &str = "https://api.smallest.ai/waves/v1/pulse/get_text";
const DEFAULT_LANGUAGE: &str = "en";
const RAW_AUDIO_CONTENT_TYPE: &str = "application/octet-stream";

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
        log::info!(
            target: LOG_TARGET,
            "smallest_transcription_request bytes={} mime_type={} language={} model={} signature={}",
            input.audio.len(),
            input.mime_type,
            resolve_language(input.language.as_deref()),
            model,
            audio_signature(&input.audio)
        );
        let client = build_http_client()?;
        let response = send_provider_request_with_retry(&client, "Smallest AI", || {
            build_transcription_request(
                &client,
                &api_key,
                &input.audio,
                &input.mime_type,
                input.language.as_deref(),
            )
        })
        .await?;
        let timing = response.timing.clone();

        let body = response.text().await?;
        let payload = parse_transcription_response(&body)?;
        let mut result = resolve_transcription_response(payload, &model)?;
        result.provider_request_started_at = Some(timing.started_at);
        result.provider_response_received_at = Some(timing.completed_at);
        Ok(result)
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
    _mime_type: &str,
    language: Option<&str>,
) -> Result<reqwest::Request, ProviderError> {
    client
        .post(TRANSCRIPTIONS_URL)
        .bearer_auth(api_key)
        .header(CONTENT_TYPE, RAW_AUDIO_CONTENT_TYPE)
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

fn parse_transcription_response(
    body: &str,
) -> Result<SmallestTranscriptionResponse, ProviderError> {
    serde_json::from_str(body).map_err(|err| {
        log::warn!(
            target: LOG_TARGET,
            "smallest_transcription_parse_failed error={} body={}",
            err,
            summarize_response_body(body)
        );
        ProviderError::from(ProviderFailure::Request(format!(
            "Smallest AI returned an unreadable response: {err}"
        )))
    })
}

fn resolve_transcription_response(
    payload: SmallestTranscriptionResponse,
    model: &str,
) -> Result<TranscriptResult, ProviderError> {
    let transcription_present = payload.transcription.is_some();
    let audio_length_present = payload.audio_length.is_some();
    let text = payload.transcription.unwrap_or_default();
    if text.trim().is_empty() {
        log::warn!(
            target: LOG_TARGET,
            "smallest_transcription_missing_text transcription_present={} audio_length_present={}",
            transcription_present,
            audio_length_present
        );
        return Err(ProviderFailure::InvalidResponse.into());
    }

    Ok(TranscriptResult {
        provider_id: PROVIDER_ID.to_string(),
        model: model.to_string(),
        text,
        duration_ms: payload.audio_length.and_then(seconds_to_millis),
        provider_request_started_at: None,
        provider_response_received_at: None,
    })
}

fn seconds_to_millis(seconds: f64) -> Option<u64> {
    if !seconds.is_finite() || seconds < 0.0 {
        return None;
    }

    Some((seconds * 1000.0).round() as u64)
}

fn audio_signature(audio: &[u8]) -> &'static str {
    if audio.starts_with(&[0x1a, 0x45, 0xdf, 0xa3]) {
        return "webm/ebml";
    }

    if audio.len() >= 12 && audio.starts_with(b"RIFF") && &audio[8..12] == b"WAVE" {
        return "wav/riff";
    }

    if audio.starts_with(b"fLaC") {
        return "flac";
    }

    if audio.starts_with(b"ID3") {
        return "mp3/id3";
    }

    if audio.first().copied() == Some(0xff) {
        return "mp3/frame";
    }

    "unknown"
}

fn summarize_response_body(body: &str) -> String {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return "<empty>".to_string();
    }

    if let Ok(json) = serde_json::from_str::<Value>(trimmed) {
        return match json {
            Value::Object(map) => {
                let mut keys = map.keys().map(String::as_str).collect::<Vec<_>>();
                keys.sort_unstable();
                format!("json_object_keys={}", keys.join(","))
            }
            Value::Array(values) => format!("json_array_len={}", values.len()),
            other => truncate_for_log(&other.to_string(), 240),
        };
    }

    truncate_for_log(trimmed, 240)
}

fn truncate_for_log(text: &str, limit: usize) -> String {
    let mut chars = text.chars();
    let truncated = chars.by_ref().take(limit).collect::<String>();
    if chars.next().is_some() {
        format!("{truncated}...")
    } else {
        truncated
    }
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
            Some("application/octet-stream")
        );
        assert_eq!(
            request.body().and_then(reqwest::Body::as_bytes),
            Some(&[1, 2, 3][..])
        );
    }

    #[test]
    fn request_defaults_missing_language_to_english() {
        let client = reqwest::Client::new();
        let request =
            build_transcription_request(&client, "smallest-test", &[1], "audio/webm", None)
                .expect("request to build");

        assert_eq!(
            request.url().query(),
            Some("language=en&word_timestamps=false&format=true&punctuate=true&capitalize=true")
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
    fn non_success_response_surfaces_status() {
        let err = request_failure_from_status(reqwest::StatusCode::UNAUTHORIZED);

        assert_eq!(err.code, "provider_auth_failed");
        assert_eq!(err.message, "Smallest AI returned 401 Unauthorized");
    }

    #[test]
    fn rate_limit_response_is_retryable() {
        let err = request_failure_from_status(reqwest::StatusCode::TOO_MANY_REQUESTS)
            .with_retry_after_ms(Some(5_000));

        assert_eq!(err.code, "provider_rate_limited");
        assert_eq!(err.message, "Smallest AI returned 429 Too Many Requests");
        assert_eq!(err.retry_after_ms, Some(5_000));
    }

    #[test]
    fn parses_complete_transcription_response_text() {
        let payload = parse_transcription_response(
            r#"{"transcription":"hello from pulse","audio_length":2.5}"#,
        )
        .expect("valid response");

        assert_eq!(payload.transcription.as_deref(), Some("hello from pulse"));
        assert_eq!(payload.audio_length, Some(2.5));
    }

    #[test]
    fn invalid_json_response_surfaces_provider_request_failure() {
        let err = parse_transcription_response("not-json").expect_err("invalid json should fail");

        assert_eq!(err.code, "provider_request_failed");
        assert!(err
            .message
            .contains("Smallest AI returned an unreadable response"));
    }

    #[test]
    fn response_summary_reports_json_keys() {
        assert_eq!(
            summarize_response_body(r#"{"foo":1,"bar":"x"}"#),
            "json_object_keys=bar,foo"
        );
    }

    #[test]
    fn audio_signature_identifies_common_containers() {
        assert_eq!(audio_signature(&[0x1a, 0x45, 0xdf, 0xa3]), "webm/ebml");
        assert_eq!(audio_signature(b"RIFF\x01\x02\x03\x04WAVE"), "wav/riff");
        assert_eq!(audio_signature(b"fLaC\x00\x00"), "flac");
        assert_eq!(audio_signature(b"ID3\x04\x00"), "mp3/id3");
    }

    fn request_failure_from_status(status: reqwest::StatusCode) -> ProviderError {
        crate::providers::request_failure("Smallest AI", status)
    }
}
