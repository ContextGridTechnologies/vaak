use async_trait::async_trait;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::providers::errors::{ProviderError, ProviderFailure};
use crate::providers::speech::SpeechProvider;
use crate::providers::{
    build_http_client, send_provider_request_with_retry, ProviderRequestTiming,
    ProviderTimelineEvent, TranscriptResult, TranscriptionInput,
};

pub const PROVIDER_ID: &str = "assemblyai";
pub const DEFAULT_MODEL: &str = "universal-3-pro";

const BASE_URL: &str = "https://api.assemblyai.com";
const MAX_AUDIO_BYTES: usize = 2_200_000_000;
const POLL_INTERVAL: Duration = Duration::from_secs(3);
const MAX_POLL_ATTEMPTS: usize = 40;

#[derive(Default)]
pub struct AssemblyAiSpeechProvider;

#[derive(Debug, Deserialize)]
struct UploadResponse {
    upload_url: String,
}

#[derive(Debug, Serialize)]
struct CreateTranscriptRequest {
    audio_url: String,
    speech_models: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    language_code: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CreateTranscriptResponse {
    id: String,
}

#[derive(Debug, Deserialize)]
struct TranscriptStatusResponse {
    status: String,
    text: Option<String>,
    error: Option<String>,
    audio_duration: Option<u64>,
    speech_model: Option<String>,
    speech_model_used: Option<String>,
}

#[async_trait]
impl SpeechProvider for AssemblyAiSpeechProvider {
    async fn transcribe(
        &self,
        api_key: String,
        input: TranscriptionInput,
    ) -> Result<TranscriptResult, ProviderError> {
        validate_input(&input)?;

        let client = build_http_client()?;
        let model = resolve_model(input.model.as_deref()).to_string();
        let mut provider_request_started_at: Option<String> = None;
        let mut provider_response_received_at: Option<String> = None;
        let mut provider_events = Vec::new();

        let upload_response = send_provider_request_with_retry(&client, "AssemblyAI", || {
            build_upload_request(&client, &api_key, &input.audio, &input.mime_type)
        })
        .await?;
        merge_timing(
            &mut provider_request_started_at,
            &mut provider_response_received_at,
            &upload_response.timing,
        );
        provider_events.push(provider_stage_event(
            "upload",
            &model,
            None,
            &upload_response.timing,
            Some(input.audio.len() as i64),
            None,
        ));

        let upload_payload = upload_response.json::<UploadResponse>().await?;
        let audio_url = upload_payload.upload_url.trim();
        if audio_url.is_empty() {
            return Err(ProviderFailure::InvalidResponse.into());
        }

        let create_response = send_provider_request_with_retry(&client, "AssemblyAI", || {
            build_transcript_request(
                &client,
                &api_key,
                audio_url,
                &model,
                input.language.as_deref(),
            )
        })
        .await?;
        merge_timing(
            &mut provider_request_started_at,
            &mut provider_response_received_at,
            &create_response.timing,
        );
        provider_events.push(provider_stage_event(
            "create_transcript",
            &model,
            None,
            &create_response.timing,
            None,
            None,
        ));

        let create_payload = create_response.json::<CreateTranscriptResponse>().await?;
        let transcript_id = create_payload.id.trim();
        if transcript_id.is_empty() {
            return Err(ProviderFailure::InvalidResponse.into());
        }

        for attempt in 0..MAX_POLL_ATTEMPTS {
            if attempt > 0 {
                tokio::time::sleep(POLL_INTERVAL).await;
            }

            let poll_response = send_provider_request_with_retry(&client, "AssemblyAI", || {
                build_poll_request(&client, &api_key, transcript_id)
            })
            .await?;
            merge_timing(
                &mut provider_request_started_at,
                &mut provider_response_received_at,
                &poll_response.timing,
            );
            provider_events.push(provider_stage_event(
                "poll",
                &model,
                Some(transcript_id),
                &poll_response.timing,
                None,
                Some(attempt as i64 + 1),
            ));

            let payload = poll_response.json::<TranscriptStatusResponse>().await?;
            if let Some(mut result) = resolve_poll_response(payload, &model)? {
                result.provider_request_started_at = provider_request_started_at;
                result.provider_response_received_at = provider_response_received_at;
                result.provider_events = provider_events;
                return Ok(result);
            }
        }

        Err(ProviderFailure::Request(
            "AssemblyAI transcription did not complete before the polling timeout".to_string(),
        )
        .into())
    }
}

fn merge_timing(
    first_started_at: &mut Option<String>,
    last_completed_at: &mut Option<String>,
    timing: &crate::providers::ProviderRequestTiming,
) {
    if first_started_at
        .as_deref()
        .map(|current| timing.started_at.as_str() < current)
        .unwrap_or(true)
    {
        *first_started_at = Some(timing.started_at.clone());
    }

    if last_completed_at
        .as_deref()
        .map(|current| timing.completed_at.as_str() > current)
        .unwrap_or(true)
    {
        *last_completed_at = Some(timing.completed_at.clone());
    }
}

fn provider_stage_event(
    stage: &str,
    model: &str,
    session_id: Option<&str>,
    timing: &ProviderRequestTiming,
    bytes_sent: Option<i64>,
    poll_count: Option<i64>,
) -> ProviderTimelineEvent {
    ProviderTimelineEvent {
        event_type: "stage".to_string(),
        provider_id: PROVIDER_ID.to_string(),
        model_id: Some(model.to_string()),
        provider_mode: "async".to_string(),
        session_id: session_id.map(ToOwned::to_owned),
        stage: Some(stage.to_string()),
        started_at: Some(timing.started_at.clone()),
        completed_at: Some(timing.completed_at.clone()),
        duration_ms: duration_between_ms(&timing.started_at, &timing.completed_at),
        status: Some("succeeded".to_string()),
        error_code: None,
        bytes_sent,
        frame_count: None,
        metadata: poll_count.map(|value| serde_json::json!({ "pollCount": value })),
    }
}

fn duration_between_ms(started_at: &str, completed_at: &str) -> Option<i64> {
    let started_at = chrono::DateTime::parse_from_rfc3339(started_at).ok()?;
    let completed_at = chrono::DateTime::parse_from_rfc3339(completed_at).ok()?;
    let duration = completed_at.signed_duration_since(started_at);
    if duration.num_milliseconds() < 0 {
        return None;
    }
    Some(duration.num_milliseconds())
}

fn validate_input(input: &TranscriptionInput) -> Result<(), ProviderError> {
    if input.audio.is_empty() {
        return Err(ProviderFailure::InvalidRequest("audio is empty".to_string()).into());
    }

    if input.audio.len() > MAX_AUDIO_BYTES {
        return Err(ProviderFailure::InvalidRequest(
            "audio file is larger than AssemblyAI's upload limit".to_string(),
        )
        .into());
    }

    Ok(())
}

fn resolve_model(model: Option<&str>) -> &str {
    model
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_MODEL)
}

fn resolve_language_code(language: Option<&str>) -> Option<String> {
    language
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn build_upload_request(
    client: &reqwest::Client,
    api_key: &str,
    audio: &[u8],
    mime_type: &str,
) -> Result<reqwest::Request, ProviderError> {
    client
        .post(format!("{BASE_URL}/v2/upload"))
        .header(AUTHORIZATION, api_key)
        .header(CONTENT_TYPE, mime_type)
        .body(audio.to_vec())
        .build()
        .map_err(ProviderError::from)
}

fn build_transcript_request(
    client: &reqwest::Client,
    api_key: &str,
    audio_url: &str,
    model: &str,
    language: Option<&str>,
) -> Result<reqwest::Request, ProviderError> {
    client
        .post(format!("{BASE_URL}/v2/transcript"))
        .header(AUTHORIZATION, api_key)
        .json(&CreateTranscriptRequest {
            audio_url: audio_url.to_string(),
            speech_models: vec![model.to_string()],
            language_code: resolve_language_code(language),
        })
        .build()
        .map_err(ProviderError::from)
}

fn build_poll_request(
    client: &reqwest::Client,
    api_key: &str,
    transcript_id: &str,
) -> Result<reqwest::Request, ProviderError> {
    client
        .get(format!("{BASE_URL}/v2/transcript/{transcript_id}"))
        .header(AUTHORIZATION, api_key)
        .build()
        .map_err(ProviderError::from)
}

fn resolve_poll_response(
    payload: TranscriptStatusResponse,
    requested_model: &str,
) -> Result<Option<TranscriptResult>, ProviderError> {
    match payload.status.as_str() {
        "queued" | "processing" => Ok(None),
        "completed" => {
            let text = payload.text.unwrap_or_default();
            if text.trim().is_empty() {
                return Err(ProviderFailure::InvalidResponse.into());
            }

            Ok(Some(TranscriptResult {
                provider_id: PROVIDER_ID.to_string(),
                model: payload
                    .speech_model_used
                    .or(payload.speech_model)
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty())
                    .unwrap_or_else(|| requested_model.to_string()),
                text,
                duration_ms: payload
                    .audio_duration
                    .and_then(|seconds| seconds.checked_mul(1000)),
                provider_request_started_at: None,
                provider_response_received_at: None,
                provider_events: Vec::new(),
            }))
        }
        "error" => Err(ProviderFailure::Request(
            payload
                .error
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "AssemblyAI transcription failed".to_string()),
        )
        .into()),
        _ => Err(ProviderFailure::InvalidResponse.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn upload_request_uses_auth_header_and_audio_bytes() {
        let client = reqwest::Client::new();
        let request = build_upload_request(&client, "assembly-test", &[1, 2, 3], "audio/webm")
            .expect("request to build");

        assert_eq!(
            request.url().as_str(),
            "https://api.assemblyai.com/v2/upload"
        );
        assert_eq!(
            request
                .headers()
                .get(AUTHORIZATION)
                .and_then(|value| value.to_str().ok()),
            Some("assembly-test")
        );
        assert_eq!(
            request
                .headers()
                .get(CONTENT_TYPE)
                .and_then(|value| value.to_str().ok()),
            Some("audio/webm")
        );
        assert_eq!(
            request.body().and_then(reqwest::Body::as_bytes),
            Some(&[1, 2, 3][..])
        );
    }

    #[test]
    fn transcript_request_sends_audio_url_and_selected_model() {
        let client = reqwest::Client::new();
        let request = build_transcript_request(
            &client,
            "assembly-test",
            "https://cdn.example.com/audio.wav",
            "universal-3-pro",
            Some("en"),
        )
        .expect("request to build");

        assert_eq!(
            request.url().as_str(),
            "https://api.assemblyai.com/v2/transcript"
        );
        assert_eq!(
            request
                .headers()
                .get(AUTHORIZATION)
                .and_then(|value| value.to_str().ok()),
            Some("assembly-test")
        );

        let body = request
            .body()
            .and_then(reqwest::Body::as_bytes)
            .expect("json body");
        let payload: Value = serde_json::from_slice(body).expect("valid json body");

        assert_eq!(
            payload,
            serde_json::json!({
                "audio_url": "https://cdn.example.com/audio.wav",
                "speech_models": ["universal-3-pro"],
                "language_code": "en"
            })
        );
    }

    #[test]
    fn polling_completed_status_returns_transcript_result() {
        let result = resolve_poll_response(
            TranscriptStatusResponse {
                status: "completed".to_string(),
                text: Some("hello from assemblyai".to_string()),
                error: None,
                audio_duration: Some(12),
                speech_model: None,
                speech_model_used: Some("universal-2".to_string()),
            },
            "universal-3-pro",
        )
        .expect("success response")
        .expect("completed transcript");

        assert_eq!(result.provider_id, "assemblyai");
        assert_eq!(result.model, "universal-2");
        assert_eq!(result.text, "hello from assemblyai");
        assert_eq!(result.duration_ms, Some(12_000));
        assert!(result.provider_events.is_empty());
    }

    #[test]
    fn provider_stage_event_records_async_stage_timing() {
        let event = provider_stage_event(
            "upload",
            "universal-3-pro",
            Some("transcript-123"),
            &ProviderRequestTiming {
                started_at: "2026-05-02T08:30:04.100Z".to_string(),
                completed_at: "2026-05-02T08:30:04.450Z".to_string(),
            },
            Some(2048),
            Some(1),
        );

        assert_eq!(event.event_type, "stage");
        assert_eq!(event.provider_id, "assemblyai");
        assert_eq!(event.model_id.as_deref(), Some("universal-3-pro"));
        assert_eq!(event.provider_mode, "async");
        assert_eq!(event.session_id.as_deref(), Some("transcript-123"));
        assert_eq!(event.stage.as_deref(), Some("upload"));
        assert_eq!(event.duration_ms, Some(350));
        assert_eq!(event.bytes_sent, Some(2048));
        assert_eq!(event.metadata, Some(serde_json::json!({ "pollCount": 1 })));
    }

    #[test]
    fn polling_error_status_surfaces_provider_failure() {
        let err = resolve_poll_response(
            TranscriptStatusResponse {
                status: "error".to_string(),
                text: None,
                error: Some("audio could not be processed".to_string()),
                audio_duration: None,
                speech_model: None,
                speech_model_used: None,
            },
            "universal-3-pro",
        )
        .expect_err("poll error should fail");

        assert_eq!(err.code, "provider_request_failed");
        assert_eq!(err.message, "audio could not be processed");
    }

    #[test]
    fn blank_completed_transcript_is_invalid() {
        let err = resolve_poll_response(
            TranscriptStatusResponse {
                status: "completed".to_string(),
                text: Some("   ".to_string()),
                error: None,
                audio_duration: Some(1),
                speech_model: None,
                speech_model_used: None,
            },
            "universal-3-pro",
        )
        .expect_err("blank transcript should fail");

        assert_eq!(err.code, "invalid_provider_response");
    }
}
