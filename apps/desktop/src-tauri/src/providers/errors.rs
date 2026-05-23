use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ProviderFailure {
    #[error("provider is not supported")]
    UnsupportedProvider,
    #[error("provider API key is not configured")]
    MissingCredential,
    #[error("provider configuration is incomplete")]
    MissingConfiguration,
    #[error("audio file is too large")]
    AudioTooLarge,
    #[error("invalid provider request: {0}")]
    InvalidRequest(String),
    #[error("provider request failed: {0}")]
    Request(String),
    #[error("provider returned an invalid response")]
    InvalidResponse,
    #[error("credential store failed: {0}")]
    CredentialStore(String),
    #[error("local settings store failed: {0}")]
    SettingsStore(String),
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_after_ms: Option<u64>,
}

impl ProviderError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            retry_after_ms: None,
        }
    }

    pub fn with_retry_after_ms(mut self, retry_after_ms: Option<u64>) -> Self {
        self.retry_after_ms = retry_after_ms;
        self
    }
}

impl From<ProviderFailure> for ProviderError {
    fn from(value: ProviderFailure) -> Self {
        match value {
            ProviderFailure::UnsupportedProvider => {
                Self::new("unsupported_provider", "provider is not supported yet")
            }
            ProviderFailure::MissingCredential => {
                Self::new("missing_provider_key", "provider API key is not configured")
            }
            ProviderFailure::MissingConfiguration => Self::new(
                "missing_provider_config",
                "provider configuration is incomplete",
            ),
            ProviderFailure::AudioTooLarge => {
                Self::new("audio_too_large", "audio file is larger than 25 MB")
            }
            ProviderFailure::InvalidRequest(message) => {
                Self::new("invalid_provider_request", message)
            }
            ProviderFailure::Request(message) => Self::new("provider_request_failed", message),
            ProviderFailure::InvalidResponse => Self::new(
                "invalid_provider_response",
                "provider returned an invalid response",
            ),
            ProviderFailure::CredentialStore(message) => {
                Self::new("credential_store_failed", message)
            }
            ProviderFailure::SettingsStore(message) => Self::new("settings_store_failed", message),
        }
    }
}

impl From<reqwest::Error> for ProviderError {
    fn from(value: reqwest::Error) -> Self {
        ProviderFailure::Request(value.to_string()).into()
    }
}
