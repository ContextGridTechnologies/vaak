pub mod credentials;
pub mod errors;
pub mod speech;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::OnceLock;
use std::time::Duration;

use crate::providers::errors::{ProviderError, ProviderFailure};
use reqwest::header::{HeaderMap, RETRY_AFTER};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionInput {
    pub audio: Vec<u8>,
    pub mime_type: String,
    pub language: Option<String>,
    pub prompt: Option<String>,
    pub model: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptResult {
    pub provider_id: String,
    pub model: String,
    pub text: String,
    pub duration_ms: Option<u64>,
    pub provider_request_started_at: Option<String>,
    pub provider_response_received_at: Option<String>,
    #[serde(default)]
    pub provider_events: Vec<ProviderTimelineEvent>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderTimelineEvent {
    pub event_type: String,
    pub provider_id: String,
    pub model_id: Option<String>,
    pub provider_mode: String,
    pub session_id: Option<String>,
    pub stage: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub duration_ms: Option<i64>,
    pub status: Option<String>,
    pub error_code: Option<String>,
    pub bytes_sent: Option<i64>,
    pub frame_count: Option<i64>,
    pub metadata: Option<Value>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRequestTiming {
    pub started_at: String,
    pub completed_at: String,
}

#[derive(Debug)]
pub struct TimedProviderResponse {
    response: reqwest::Response,
    pub timing: ProviderRequestTiming,
}

impl TimedProviderResponse {
    #[cfg(test)]
    #[must_use]
    pub fn status(&self) -> reqwest::StatusCode {
        self.response.status()
    }

    pub async fn json<T>(self) -> Result<T, reqwest::Error>
    where
        T: serde::de::DeserializeOwned,
    {
        self.response.json::<T>().await
    }

    pub async fn text(self) -> Result<String, reqwest::Error> {
        self.response.text().await
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    pub provider_id: String,
    pub configured: bool,
    pub config_complete: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    pub endpoint: Option<String>,
    pub deployment_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub streaming_deployment_id: Option<String>,
    pub api_version: Option<String>,
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transcription_mode: Option<String>,
}

const HTTP_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const DEFAULT_RATE_LIMIT_RETRY_DELAY: Duration = Duration::from_secs(5);
const DEFAULT_UPSTREAM_RETRY_DELAY: Duration = Duration::from_millis(500);
const MAX_PROVIDER_HTTP_ATTEMPTS: usize = 2;
const DEFAULT_AZURE_API_VERSION: &str = "2025-04-01-preview";
const MAX_LANGUAGE_FIELD_LEN: usize = 32;
const MAX_PROVIDER_FIELD_LEN: usize = 256;
const MAX_TRANSCRIPTION_PROMPT_LEN: usize = 4_096;
const MAX_AUDIO_MIME_TYPE_LEN: usize = 64;
const PROVIDER_RESPONSE_LOG_LIMIT: usize = 240;
const SAFE_PROVIDER_ERROR_FIELDS: &[&str] = &["code", "detail", "error", "message"];
const AZURE_PROVIDER_ID: &str = "azure-openai";
const AZURE_AI_SPEECH_PROVIDER_ID: &str = "azure-ai-speech";
const ALLOWED_AUDIO_MIME_TYPES: &[&str] = &[
    "audio/aac",
    "audio/flac",
    "audio/m4a",
    "audio/mp3",
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "audio/webm",
    "audio/x-flac",
    "audio/x-wav",
];

pub fn build_http_client() -> Result<reqwest::Client, ProviderError> {
    shared_http_client().cloned()
}

fn shared_http_client() -> Result<&'static reqwest::Client, ProviderError> {
    static HTTP_CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();
    HTTP_CLIENT
        .get_or_init(|| {
            reqwest::Client::builder()
                .timeout(HTTP_REQUEST_TIMEOUT)
                .redirect(reqwest::redirect::Policy::limited(5))
                .build()
                .map_err(|err| err.to_string())
        })
        .as_ref()
        .map_err(|err| ProviderFailure::Request(err.clone()).into())
}

pub fn normalize_audio_mime_type(mime_type: &str) -> Result<String, ProviderError> {
    let normalized = mime_type
        .split(';')
        .next()
        .map(str::trim)
        .unwrap_or_default()
        .to_ascii_lowercase();

    if normalized.is_empty() || normalized.len() > MAX_AUDIO_MIME_TYPE_LEN {
        return Err(
            ProviderFailure::InvalidRequest("audio mime type is invalid".to_string()).into(),
        );
    }

    if ALLOWED_AUDIO_MIME_TYPES.contains(&normalized.as_str()) {
        return Ok(normalized);
    }

    Err(ProviderFailure::InvalidRequest("audio mime type is not supported".to_string()).into())
}

pub fn normalize_provider_config(
    provider_id: &str,
    config: ProviderConfig,
) -> Result<ProviderConfig, ProviderError> {
    speech::validate_provider_id(provider_id)?;

    let model = normalize_optional_provider_field(config.model, "provider model")?;
    let transcription_mode = normalize_transcription_mode(provider_id, config.transcription_mode)?;
    if provider_id == AZURE_PROVIDER_ID {
        return Ok(ProviderConfig {
            endpoint: Some(normalize_bare_https_origin(
                config.endpoint,
                "Azure OpenAI endpoint",
            )?),
            deployment_id: Some(normalize_deployment_id(config.deployment_id)?),
            streaming_deployment_id: normalize_optional_deployment_id(
                config.streaming_deployment_id,
                "Azure OpenAI streaming deployment id",
            )?,
            api_version: Some(normalize_api_version(config.api_version)?),
            model,
            transcription_mode,
        });
    }

    if provider_id == AZURE_AI_SPEECH_PROVIDER_ID {
        return Ok(ProviderConfig {
            endpoint: Some(normalize_bare_https_origin(
                config.endpoint,
                "Azure AI Speech endpoint",
            )?),
            deployment_id: None,
            streaming_deployment_id: None,
            api_version: None,
            model: None,
            transcription_mode: None,
        });
    }

    Ok(ProviderConfig {
        endpoint: None,
        deployment_id: None,
        streaming_deployment_id: None,
        api_version: None,
        model,
        transcription_mode,
    })
}

fn normalize_transcription_mode(
    provider_id: &str,
    value: Option<String>,
) -> Result<Option<String>, ProviderError> {
    if provider_id != "assemblyai" {
        return Ok(None);
    }

    let Some(value) = normalize_optional_provider_field(value, "transcription mode")? else {
        return Ok(None);
    };

    match value.as_str() {
        "balanced" | "fast" | "accurate" => Ok(Some(value)),
        _ => Err(ProviderFailure::InvalidRequest(
            "AssemblyAI transcription mode is unsupported".to_string(),
        )
        .into()),
    }
}

pub fn normalize_optional_provider_field(
    value: Option<String>,
    label: &str,
) -> Result<Option<String>, ProviderError> {
    normalize_optional_field(value, label, MAX_PROVIDER_FIELD_LEN)
}

pub fn normalize_language_field(value: Option<String>) -> Result<Option<String>, ProviderError> {
    normalize_optional_field(value, "language", MAX_LANGUAGE_FIELD_LEN)
}

pub fn normalize_transcription_prompt(
    value: Option<String>,
) -> Result<Option<String>, ProviderError> {
    let Some(value) = value else {
        return Ok(None);
    };

    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let has_unsupported_control = trimmed
        .chars()
        .any(|character| character.is_control() && !matches!(character, '\n' | '\r' | '\t'));
    if trimmed.chars().count() > MAX_TRANSCRIPTION_PROMPT_LEN || has_unsupported_control {
        return Err(ProviderFailure::InvalidRequest("prompt is invalid".to_string()).into());
    }

    Ok(Some(trimmed.to_string()))
}

fn normalize_optional_field(
    value: Option<String>,
    label: &str,
    max_len: usize,
) -> Result<Option<String>, ProviderError> {
    let Some(value) = value else {
        return Ok(None);
    };

    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    if trimmed.len() > max_len || trimmed.chars().any(char::is_control) {
        return Err(ProviderFailure::InvalidRequest(format!("{label} is invalid")).into());
    }

    Ok(Some(trimmed.to_string()))
}

#[cfg(test)]
pub fn request_failure(provider_name: &str, status: reqwest::StatusCode) -> ProviderError {
    request_failure_with_context(provider_name, status, None, None)
}

pub async fn send_provider_request_with_retry(
    client: &reqwest::Client,
    provider_name: &str,
    mut build_request: impl FnMut() -> Result<reqwest::Request, ProviderError>,
) -> Result<TimedProviderResponse, ProviderError> {
    let mut first_started_at: Option<String> = None;

    for attempt in 0..MAX_PROVIDER_HTTP_ATTEMPTS {
        let request = build_request()?;
        let started_at = current_utc_timestamp();
        if first_started_at.is_none() {
            first_started_at = Some(started_at.clone());
        }
        let response_result = client.execute(request).await;
        let completed_at = current_utc_timestamp();
        let response = match response_result {
            Ok(response) => response,
            Err(err) => {
                return Err(ProviderError::from(err)
                    .with_provider_timing(first_started_at, Some(completed_at)));
            }
        };
        if response.status().is_success() {
            return Ok(TimedProviderResponse {
                response,
                timing: ProviderRequestTiming {
                    started_at: first_started_at.unwrap_or(started_at),
                    completed_at,
                },
            });
        }

        if attempt + 1 >= MAX_PROVIDER_HTTP_ATTEMPTS || !is_retryable_status(response.status()) {
            return Err(request_failure_from_response(provider_name, response)
                .await
                .with_provider_timing(first_started_at, Some(completed_at)));
        }

        let delay = retry_delay(response.headers(), response.status());
        tokio::time::sleep(delay).await;
    }

    Err(ProviderFailure::Request(format!("{provider_name} request failed")).into())
}

fn current_utc_timestamp() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

pub async fn request_failure_from_response(
    provider_name: &str,
    response: reqwest::Response,
) -> ProviderError {
    let status = response.status();
    let retry_after_ms = retry_after_ms(response.headers());
    let body = response.text().await.ok();
    log::warn!(
        target: "vaak::providers",
        "provider_request_failed provider={} status={} retry_after_ms={:?} body={}",
        provider_name,
        status.as_u16(),
        retry_after_ms,
        body.as_deref()
            .map(summarize_provider_response_body)
            .unwrap_or_else(|| "<unavailable>".to_string())
    );

    request_failure_with_context(provider_name, status, retry_after_ms, body.as_deref())
}

fn request_failure_with_context(
    provider_name: &str,
    status: reqwest::StatusCode,
    retry_after_ms: Option<u64>,
    body: Option<&str>,
) -> ProviderError {
    let body = body.unwrap_or_default();
    let message = format!("{provider_name} returned {status}");
    let error = if status == reqwest::StatusCode::UNAUTHORIZED {
        if looks_like_quota_error(body) {
            ProviderError::new("provider_quota_exhausted", message)
        } else {
            ProviderError::new("provider_auth_failed", message)
        }
    } else if status == reqwest::StatusCode::PAYMENT_REQUIRED {
        ProviderError::new("provider_quota_exhausted", message)
    } else if status == reqwest::StatusCode::FORBIDDEN {
        if looks_like_quota_error(body) {
            ProviderError::new("provider_quota_exhausted", message)
        } else {
            ProviderError::new("provider_permission_failed", message)
        }
    } else if status == reqwest::StatusCode::BAD_REQUEST {
        ProviderError::new(
            "provider_bad_request",
            format!("{provider_name} rejected the audio request"),
        )
    } else if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        if looks_like_quota_error(body) {
            ProviderError::new("provider_quota_exhausted", message)
        } else {
            ProviderError::new("provider_rate_limited", message)
        }
    } else if status.is_server_error() {
        ProviderError::new("provider_upstream_failed", message)
    } else {
        ProviderFailure::Request(message).into()
    };

    error.with_retry_after_ms(retry_after_ms)
}

fn retry_after_ms(headers: &HeaderMap) -> Option<u64> {
    let value = headers.get(RETRY_AFTER)?.to_str().ok()?.trim();
    let seconds = value.parse::<u64>().ok()?;

    seconds.checked_mul(1000)
}

fn retry_delay(headers: &HeaderMap, status: reqwest::StatusCode) -> Duration {
    retry_after_ms(headers)
        .map(Duration::from_millis)
        .unwrap_or_else(|| {
            if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
                DEFAULT_RATE_LIMIT_RETRY_DELAY
            } else {
                DEFAULT_UPSTREAM_RETRY_DELAY
            }
        })
}

fn is_retryable_status(status: reqwest::StatusCode) -> bool {
    status == reqwest::StatusCode::TOO_MANY_REQUESTS || status.is_server_error()
}

fn looks_like_quota_error(body: &str) -> bool {
    let normalized = body.to_ascii_lowercase();
    [
        "credit_balance_exhausted",
        "insufficient balance",
        "insufficient credit",
        "insufficient quota",
        "insufficient_quota",
        "no credits",
        "organization_spend_limit_exceeded",
        "organization_usage_limit_exceeded",
        "out of credits",
        "project_spend_limit_exceeded",
        "quota exceeded",
        "usage limit",
        "limit reached",
        "billing",
    ]
    .iter()
    .any(|needle| normalized.contains(needle))
}

fn summarize_provider_response_body(body: &str) -> String {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return "<empty>".to_string();
    }

    if let Ok(json) = serde_json::from_str::<Value>(trimmed) {
        return match json {
            Value::Object(map) => {
                let mut keys = map.keys().map(String::as_str).collect::<Vec<_>>();
                keys.sort_unstable();

                let mut fields = Vec::new();
                for field in SAFE_PROVIDER_ERROR_FIELDS {
                    if let Some(Value::String(value)) = map.get(*field) {
                        fields.push(format!(
                            "{}=\"{}\"",
                            field,
                            truncate_for_provider_log(value, 120)
                        ));
                    }
                }
                fields.push(format!("keys={}", keys.join(",")));
                format!("json_object {}", fields.join(" "))
            }
            Value::Array(values) => format!("json_array_len={}", values.len()),
            other => truncate_for_provider_log(&other.to_string(), PROVIDER_RESPONSE_LOG_LIMIT),
        };
    }

    truncate_for_provider_log(trimmed, PROVIDER_RESPONSE_LOG_LIMIT)
}

fn truncate_for_provider_log(text: &str, limit: usize) -> String {
    let mut chars = text.chars();
    let truncated = chars.by_ref().take(limit).collect::<String>();
    if chars.next().is_some() {
        format!("{truncated}...")
    } else {
        truncated
    }
}

fn normalize_bare_https_origin(
    endpoint: Option<String>,
    label: &str,
) -> Result<String, ProviderError> {
    let endpoint = normalize_required_provider_field(endpoint, label)?;
    let parsed = reqwest::Url::parse(&endpoint)
        .map_err(|_| ProviderFailure::InvalidRequest(format!("{label} is invalid")))?;

    let is_local_http = parsed.scheme() == "http"
        && matches!(parsed.host_str(), Some("localhost" | "127.0.0.1" | "::1"));
    if parsed.scheme() != "https" && !is_local_http {
        return Err(ProviderFailure::InvalidRequest(format!("{label} must use https")).into());
    }

    if parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || parsed.path() != "/"
    {
        return Err(
            ProviderFailure::InvalidRequest(format!("{label} must be a bare origin")).into(),
        );
    }

    Ok(endpoint.trim_end_matches('/').to_string())
}

fn normalize_deployment_id(value: Option<String>) -> Result<String, ProviderError> {
    let deployment_id = normalize_required_provider_field(value, "Azure OpenAI deployment id")?;
    validate_deployment_id(&deployment_id, "Azure OpenAI deployment id")?;
    Ok(deployment_id)
}

fn normalize_optional_deployment_id(
    value: Option<String>,
    label: &str,
) -> Result<Option<String>, ProviderError> {
    let Some(deployment_id) = normalize_optional_provider_field(value, label)? else {
        return Ok(None);
    };
    validate_deployment_id(&deployment_id, label)?;
    Ok(Some(deployment_id))
}

fn validate_deployment_id(deployment_id: &str, label: &str) -> Result<(), ProviderError> {
    if !deployment_id
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
    {
        return Err(ProviderFailure::InvalidRequest(format!(
            "{label} contains unsupported characters"
        ))
        .into());
    }

    Ok(())
}

fn normalize_api_version(value: Option<String>) -> Result<String, ProviderError> {
    let api_version = normalize_optional_provider_field(value, "Azure OpenAI API version")?
        .unwrap_or_else(|| DEFAULT_AZURE_API_VERSION.to_string());
    if !api_version
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
    {
        return Err(ProviderFailure::InvalidRequest(
            "Azure OpenAI API version contains unsupported characters".to_string(),
        )
        .into());
    }

    Ok(api_version)
}

fn normalize_required_provider_field(
    value: Option<String>,
    label: &str,
) -> Result<String, ProviderError> {
    normalize_optional_provider_field(value, label)?
        .ok_or_else(|| ProviderFailure::InvalidRequest(format!("{label} is required")).into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::header::HeaderName;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };
    use std::thread;

    #[test]
    fn strips_audio_mime_parameters_before_validation() {
        let normalized = normalize_audio_mime_type("audio/webm;codecs=opus").unwrap();

        assert_eq!(normalized, "audio/webm");
    }

    #[test]
    fn rejects_unsupported_audio_mime_types() {
        let err = normalize_audio_mime_type("text/plain").unwrap_err();

        assert_eq!(err.code, "invalid_provider_request");
    }

    #[test]
    fn normalizes_non_azure_provider_configs_to_supported_fields() {
        let config = normalize_provider_config(
            "openai",
            ProviderConfig {
                endpoint: Some("https://unused.example.com".to_string()),
                deployment_id: Some("unused".to_string()),
                streaming_deployment_id: None,
                api_version: Some("unused".to_string()),
                model: Some(" gpt-4o-mini-transcribe ".to_string()),
                transcription_mode: None,
            },
        )
        .unwrap();

        assert_eq!(config.endpoint, None);
        assert_eq!(config.deployment_id, None);
        assert_eq!(config.api_version, None);
        assert_eq!(config.model.as_deref(), Some("gpt-4o-mini-transcribe"));
    }

    #[test]
    fn rejects_azure_endpoint_paths() {
        let err = normalize_provider_config(
            "azure-openai",
            ProviderConfig {
                endpoint: Some("https://example.openai.azure.com/custom".to_string()),
                deployment_id: Some("whisper".to_string()),
                streaming_deployment_id: None,
                api_version: Some("2025-04-01-preview".to_string()),
                model: None,
                transcription_mode: None,
            },
        )
        .unwrap_err();

        assert_eq!(err.code, "invalid_provider_request");
    }

    #[test]
    fn defaults_blank_azure_api_version() {
        let config = normalize_provider_config(
            "azure-openai",
            ProviderConfig {
                endpoint: Some("https://example.openai.azure.com".to_string()),
                deployment_id: Some("whisper".to_string()),
                streaming_deployment_id: None,
                api_version: Some("   ".to_string()),
                model: None,
                transcription_mode: None,
            },
        )
        .unwrap();

        assert_eq!(config.api_version.as_deref(), Some("2025-04-01-preview"));
    }

    #[test]
    fn rejects_azure_endpoint_queries_and_credentials() {
        for endpoint in [
            "https://example.openai.azure.com?api-version=2025-04-01-preview",
            "https://user@example.openai.azure.com",
            "https://user:pass@example.openai.azure.com",
        ] {
            let err = normalize_provider_config(
                "azure-openai",
                ProviderConfig {
                    endpoint: Some(endpoint.to_string()),
                    deployment_id: Some("whisper".to_string()),
                    streaming_deployment_id: None,
                    api_version: None,
                    model: None,
                    transcription_mode: None,
                },
            )
            .unwrap_err();

            assert_eq!(err.code, "invalid_provider_request");
        }
    }

    #[test]
    fn rejects_azure_deployment_id_path_injection() {
        let err = normalize_provider_config(
            "azure-openai",
            ProviderConfig {
                endpoint: Some("https://example.openai.azure.com".to_string()),
                deployment_id: Some("../whisper".to_string()),
                streaming_deployment_id: None,
                api_version: None,
                model: None,
                transcription_mode: None,
            },
        )
        .unwrap_err();

        assert_eq!(err.code, "invalid_provider_request");
    }

    #[test]
    fn normalizes_azure_openai_streaming_deployment_separately() {
        let config = normalize_provider_config(
            "azure-openai",
            ProviderConfig {
                endpoint: Some("https://example.openai.azure.com".to_string()),
                deployment_id: Some("gpt-4o-mini-transcribe".to_string()),
                streaming_deployment_id: Some("gpt-realtime".to_string()),
                api_version: None,
                model: None,
                transcription_mode: None,
            },
        )
        .unwrap();

        assert_eq!(
            config.deployment_id.as_deref(),
            Some("gpt-4o-mini-transcribe")
        );
        assert_eq!(
            config.streaming_deployment_id.as_deref(),
            Some("gpt-realtime")
        );
    }

    #[test]
    fn normalizes_azure_ai_speech_config_without_openai_deployment() {
        let config = normalize_provider_config(
            "azure-ai-speech",
            ProviderConfig {
                endpoint: Some("https://example.cognitiveservices.azure.com".to_string()),
                deployment_id: None,
                streaming_deployment_id: None,
                api_version: None,
                model: None,
                transcription_mode: None,
            },
        )
        .unwrap();

        assert_eq!(
            config.endpoint.as_deref(),
            Some("https://example.cognitiveservices.azure.com")
        );
        assert_eq!(config.deployment_id, None);
    }

    #[test]
    fn accepts_long_bounded_transcription_prompts() {
        let prompt = "a".repeat(4_096);
        let normalized = normalize_transcription_prompt(Some(prompt.clone())).unwrap();

        assert_eq!(normalized.as_deref(), Some(prompt.as_str()));
    }

    #[test]
    fn accepts_multiline_transcription_prompts() {
        let prompt = "Keep the wording faithful.\n\nUse bullet points when dictated.";

        assert_eq!(
            normalize_transcription_prompt(Some(prompt.to_string()))
                .unwrap()
                .as_deref(),
            Some(prompt)
        );
    }

    #[test]
    fn rejects_over_limit_transcription_prompts() {
        let prompt = "a".repeat(4_097);
        let err = normalize_transcription_prompt(Some(prompt)).unwrap_err();

        assert_eq!(err.code, "invalid_provider_request");
    }

    #[test]
    fn shared_http_client_returns_same_instance() {
        let first = shared_http_client().expect("shared client");
        let second = shared_http_client().expect("shared client");

        assert!(std::ptr::eq(first, second));
    }

    #[test]
    fn classifies_bad_requests_as_provider_audio_request_failures() {
        let err = request_failure("OpenAI", reqwest::StatusCode::BAD_REQUEST);

        assert_eq!(err.code, "provider_bad_request");
        assert_eq!(err.message, "OpenAI rejected the audio request");
        assert!(!err.message.contains("invalid_request_error"));
    }

    #[test]
    fn classifies_auth_failures_without_exposing_provider_body() {
        let err = request_failure_with_context(
            "AssemblyAI",
            reqwest::StatusCode::UNAUTHORIZED,
            None,
            Some(r#"{"error":"Authentication error, API token missing/invalid"}"#),
        );

        assert_eq!(err.code, "provider_auth_failed");
        assert_eq!(err.message, "AssemblyAI returned 401 Unauthorized");
    }

    #[test]
    fn classifies_balance_failures_separately_from_auth() {
        let err = request_failure_with_context(
            "AssemblyAI",
            reqwest::StatusCode::UNAUTHORIZED,
            None,
            Some(r#"{"error":"insufficient balance"}"#),
        );

        assert_eq!(err.code, "provider_quota_exhausted");
        assert_eq!(err.message, "AssemblyAI returned 401 Unauthorized");
    }

    #[test]
    fn classifies_openai_quota_429_separately_from_rate_limits() {
        for code in [
            "credit_balance_exhausted",
            "organization_spend_limit_exceeded",
            "project_spend_limit_exceeded",
            "organization_usage_limit_exceeded",
            "insufficient_quota",
        ] {
            let body = format!(r#"{{"error":{{"code":"{code}"}}}}"#);
            let err = request_failure_with_context(
                "OpenAI",
                reqwest::StatusCode::TOO_MANY_REQUESTS,
                None,
                Some(&body),
            );

            assert_eq!(err.code, "provider_quota_exhausted", "code: {code}");
        }
    }

    #[test]
    fn classifies_rate_limits_and_preserves_retry_after() {
        let err = request_failure_with_context(
            "Smallest AI",
            reqwest::StatusCode::TOO_MANY_REQUESTS,
            Some(5_000),
            None,
        );

        assert_eq!(err.code, "provider_rate_limited");
        assert_eq!(err.message, "Smallest AI returned 429 Too Many Requests");
        assert_eq!(err.retry_after_ms, Some(5_000));
    }

    #[test]
    fn only_rate_limits_and_server_errors_are_retryable() {
        assert!(is_retryable_status(reqwest::StatusCode::TOO_MANY_REQUESTS));
        assert!(is_retryable_status(
            reqwest::StatusCode::INTERNAL_SERVER_ERROR
        ));
        assert!(!is_retryable_status(reqwest::StatusCode::UNAUTHORIZED));
        assert!(!is_retryable_status(reqwest::StatusCode::FORBIDDEN));
    }

    #[test]
    fn retry_delay_prefers_retry_after_header() {
        let mut headers = HeaderMap::new();
        headers.insert(RETRY_AFTER, "7".parse().unwrap());

        assert_eq!(
            retry_delay(&headers, reqwest::StatusCode::TOO_MANY_REQUESTS),
            Duration::from_secs(7)
        );
    }

    #[test]
    fn classifies_upstream_failures() {
        let err = request_failure("Smallest AI", reqwest::StatusCode::INTERNAL_SERVER_ERROR);

        assert_eq!(err.code, "provider_upstream_failed");
        assert_eq!(
            err.message,
            "Smallest AI returned 500 Internal Server Error"
        );
    }

    #[test]
    fn retry_helper_rebuilds_request_for_retryable_rate_limit() {
        let server = SequenceServer::spawn(vec![
            TestResponse::new(429).with_header("Retry-After", "0"),
            TestResponse::new(200).with_body("ok"),
        ]);

        let client = reqwest::Client::new();
        let request_builds = Arc::new(AtomicUsize::new(0));
        let builds = Arc::clone(&request_builds);

        let response = runtime().block_on(send_provider_request_with_retry(
            &client,
            "Test Provider",
            || {
                builds.fetch_add(1, Ordering::SeqCst);
                client
                    .get(server.url())
                    .build()
                    .map_err(ProviderError::from)
            },
        ));

        assert_eq!(
            response.as_ref().expect("retry succeeds").status(),
            reqwest::StatusCode::OK
        );
        let timing = response.expect("retry succeeds").timing;
        assert!(timing.started_at <= timing.completed_at);
        assert_eq!(request_builds.load(Ordering::SeqCst), 2);
        assert_eq!(server.requests(), 2);
    }

    #[test]
    fn retry_helper_retries_server_errors_once() {
        let server = SequenceServer::spawn(vec![TestResponse::new(500), TestResponse::new(200)]);
        let client = reqwest::Client::new();

        let response = runtime().block_on(send_provider_request_with_retry(
            &client,
            "Test Provider",
            || {
                client
                    .get(server.url())
                    .build()
                    .map_err(ProviderError::from)
            },
        ));

        let response = response.expect("retry succeeds");
        assert_eq!(response.status(), reqwest::StatusCode::OK);
        assert!(response.timing.started_at <= response.timing.completed_at);
        assert_eq!(server.requests(), 2);
    }

    #[test]
    fn retry_helper_does_not_retry_auth_or_permission_failures() {
        for status in [401, 403] {
            let server = SequenceServer::spawn(vec![TestResponse::new(status)]);
            let client = reqwest::Client::new();

            let err = runtime()
                .block_on(send_provider_request_with_retry(
                    &client,
                    "Test Provider",
                    || {
                        client
                            .get(server.url())
                            .build()
                            .map_err(ProviderError::from)
                    },
                ))
                .expect_err("non-retryable status should fail");

            assert_eq!(
                err.message,
                format!("Test Provider returned {status} {}", status_text(status))
            );
            assert!(err.provider_request_started_at.is_some());
            assert!(err.provider_response_received_at.is_some());
            assert_eq!(server.requests(), 1);
        }
    }

    #[test]
    fn retry_helper_preserves_retry_after_on_final_rate_limit_failure() {
        let server = SequenceServer::spawn(vec![
            TestResponse::new(429).with_header("Retry-After", "0"),
            TestResponse::new(429).with_header("Retry-After", "7"),
        ]);
        let client = reqwest::Client::new();

        let err = runtime()
            .block_on(send_provider_request_with_retry(
                &client,
                "Test Provider",
                || {
                    client
                        .get(server.url())
                        .build()
                        .map_err(ProviderError::from)
                },
            ))
            .expect_err("final rate limit should fail");

        assert_eq!(err.code, "provider_rate_limited");
        assert_eq!(err.message, "Test Provider returned 429 Too Many Requests");
        assert_eq!(err.retry_after_ms, Some(7_000));
        assert!(err.provider_request_started_at.is_some());
        assert!(err.provider_response_received_at.is_some());
        assert_eq!(server.requests(), 2);
    }

    #[test]
    fn provider_response_summary_keeps_safe_error_fields() {
        let summary = summarize_provider_response_body(
            r#"{"request_id":"internal-123","message":"Unsupported audio format","code":"bad_audio","error":"Invalid audio"}"#,
        );

        assert_eq!(
            summary,
            r#"json_object code="bad_audio" error="Invalid audio" message="Unsupported audio format" keys=code,error,message,request_id"#
        );
        assert!(!summary.contains("internal-123"));
    }

    #[test]
    fn provider_response_summary_truncates_plain_text() {
        let summary = summarize_provider_response_body(&"a".repeat(260));

        assert_eq!(summary.len(), 243);
        assert!(summary.ends_with("..."));
    }

    fn runtime() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("tokio runtime")
    }

    fn status_text(status: u16) -> &'static str {
        match status {
            401 => "Unauthorized",
            403 => "Forbidden",
            _ => "",
        }
    }

    struct TestResponse {
        status: u16,
        headers: Vec<(&'static str, &'static str)>,
        body: &'static str,
    }

    impl TestResponse {
        fn new(status: u16) -> Self {
            Self {
                status,
                headers: Vec::new(),
                body: "",
            }
        }

        fn with_header(mut self, name: &'static str, value: &'static str) -> Self {
            self.headers.push((name, value));
            self
        }

        fn with_body(mut self, body: &'static str) -> Self {
            self.body = body;
            self
        }
    }

    struct SequenceServer {
        url: String,
        requests: Arc<AtomicUsize>,
    }

    impl SequenceServer {
        fn spawn(responses: Vec<TestResponse>) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").expect("test server binds");
            let url = format!("http://{}", listener.local_addr().expect("local addr"));
            let requests = Arc::new(AtomicUsize::new(0));
            let request_count = Arc::clone(&requests);

            thread::spawn(move || {
                for response in responses {
                    let (mut stream, _) = listener.accept().expect("test connection");
                    request_count.fetch_add(1, Ordering::SeqCst);

                    let mut buffer = [0_u8; 1024];
                    let _ = stream.read(&mut buffer);

                    let reason = status_text(response.status);
                    let mut raw_response = format!(
                        "HTTP/1.1 {} {}\r\nContent-Length: {}\r\nConnection: close\r\n",
                        response.status,
                        reason,
                        response.body.len()
                    );
                    for (name, value) in response.headers {
                        HeaderName::from_bytes(name.as_bytes()).expect("valid test header");
                        raw_response.push_str(name);
                        raw_response.push_str(": ");
                        raw_response.push_str(value);
                        raw_response.push_str("\r\n");
                    }
                    raw_response.push_str("\r\n");
                    raw_response.push_str(response.body);
                    stream
                        .write_all(raw_response.as_bytes())
                        .expect("test response writes");
                }
            });

            Self { url, requests }
        }

        fn url(&self) -> &str {
            &self.url
        }

        fn requests(&self) -> usize {
            self.requests.load(Ordering::SeqCst)
        }
    }
}
