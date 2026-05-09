pub mod credentials;
pub mod errors;
pub mod speech;

use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::providers::errors::{ProviderError, ProviderFailure};

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
    pub api_version: Option<String>,
    pub model: Option<String>,
}

const HTTP_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const DEFAULT_AZURE_API_VERSION: &str = "2025-04-01-preview";
const MAX_LANGUAGE_FIELD_LEN: usize = 32;
const MAX_PROVIDER_FIELD_LEN: usize = 256;
const MAX_TRANSCRIPTION_PROMPT_LEN: usize = 4_096;
const MAX_AUDIO_MIME_TYPE_LEN: usize = 64;
const AZURE_PROVIDER_ID: &str = "azure-openai";
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
    reqwest::Client::builder()
        .timeout(HTTP_REQUEST_TIMEOUT)
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(ProviderError::from)
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
    if provider_id == AZURE_PROVIDER_ID {
        return Ok(ProviderConfig {
            endpoint: Some(normalize_azure_endpoint(config.endpoint)?),
            deployment_id: Some(normalize_deployment_id(config.deployment_id)?),
            api_version: Some(normalize_api_version(config.api_version)?),
            model,
        });
    }

    Ok(ProviderConfig {
        endpoint: None,
        deployment_id: None,
        api_version: None,
        model,
    })
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
    normalize_optional_field(value, "prompt", MAX_TRANSCRIPTION_PROMPT_LEN)
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

pub fn request_failure(provider_name: &str, status: reqwest::StatusCode) -> ProviderError {
    ProviderFailure::Request(format!("{provider_name} returned {status}")).into()
}

fn normalize_azure_endpoint(endpoint: Option<String>) -> Result<String, ProviderError> {
    let endpoint = normalize_required_provider_field(endpoint, "Azure OpenAI endpoint")?;
    let parsed = reqwest::Url::parse(&endpoint).map_err(|_| {
        ProviderFailure::InvalidRequest("Azure OpenAI endpoint is invalid".to_string())
    })?;

    let is_local_http = parsed.scheme() == "http"
        && matches!(parsed.host_str(), Some("localhost" | "127.0.0.1" | "::1"));
    if parsed.scheme() != "https" && !is_local_http {
        return Err(ProviderFailure::InvalidRequest(
            "Azure OpenAI endpoint must use https".to_string(),
        )
        .into());
    }

    if parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || parsed.path() != "/"
    {
        return Err(ProviderFailure::InvalidRequest(
            "Azure OpenAI endpoint must be a bare origin".to_string(),
        )
        .into());
    }

    Ok(endpoint.trim_end_matches('/').to_string())
}

fn normalize_deployment_id(value: Option<String>) -> Result<String, ProviderError> {
    let deployment_id = normalize_required_provider_field(value, "Azure OpenAI deployment id")?;
    if !deployment_id
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
    {
        return Err(ProviderFailure::InvalidRequest(
            "Azure OpenAI deployment id contains unsupported characters".to_string(),
        )
        .into());
    }

    Ok(deployment_id)
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
                api_version: Some("unused".to_string()),
                model: Some(" gpt-4o-mini-transcribe ".to_string()),
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
                api_version: Some("2025-04-01-preview".to_string()),
                model: None,
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
                api_version: Some("   ".to_string()),
                model: None,
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
                    api_version: None,
                    model: None,
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
                api_version: None,
                model: None,
            },
        )
        .unwrap_err();

        assert_eq!(err.code, "invalid_provider_request");
    }

    #[test]
    fn accepts_long_bounded_transcription_prompts() {
        let prompt = "a".repeat(4_096);
        let normalized = normalize_transcription_prompt(Some(prompt.clone())).unwrap();

        assert_eq!(normalized.as_deref(), Some(prompt.as_str()));
    }

    #[test]
    fn rejects_over_limit_transcription_prompts() {
        let prompt = "a".repeat(4_097);
        let err = normalize_transcription_prompt(Some(prompt)).unwrap_err();

        assert_eq!(err.code, "invalid_provider_request");
    }

    #[test]
    fn keeps_provider_request_failures_status_only() {
        let err = request_failure("OpenAI", reqwest::StatusCode::BAD_REQUEST);

        assert_eq!(err.code, "provider_request_failed");
        assert_eq!(err.message, "OpenAI returned 400 Bad Request");
        assert!(!err.message.contains("invalid_request_error"));
    }
}
