use async_trait::async_trait;
use reqwest::header::CONTENT_TYPE;
use serde::Deserialize;
use serde_json::Value;

use crate::providers::errors::{ProviderError, ProviderFailure};
use crate::providers::speech::SpeechProvider;
use crate::providers::{build_http_client, request_failure, TranscriptResult, TranscriptionInput};

pub const PROVIDER_ID: &str = "smallest";
pub const DEFAULT_MODEL: &str = "pulse";
const LOG_TARGET: &str = "vaak::providers::speech::smallest";

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
        let client = build_http_client()?;
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
            return Err(request_failure("Smallest AI", status));
        }

        let body = response.text().await?;
        let payload = parse_transcription_response(&body)?;
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

fn parse_transcription_response(body: &str) -> Result<SmallestTranscriptionResponse, ProviderError> {
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
    })
}

fn seconds_to_millis(seconds: f64) -> Option<u64> {
    if !seconds.is_finite() || seconds < 0.0 {
        return None;
    }

    Some((seconds * 1000.0).round() as u64)
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
    fn non_success_response_surfaces_status() {
        let err = request_failure("Smallest AI", reqwest::StatusCode::UNAUTHORIZED);

        assert_eq!(err.code, "provider_request_failed");
        assert_eq!(err.message, "Smallest AI returned 401 Unauthorized");
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
        assert!(err.message.contains("Smallest AI returned an unreadable response"));
    }

    #[test]
    fn response_summary_reports_json_keys() {
        assert_eq!(
            summarize_response_body(r#"{"foo":1,"bar":"x"}"#),
            "json_object_keys=bar,foo"
        );
    }
}
