pub mod credentials;
pub mod errors;
pub mod speech;

use serde::{Deserialize, Serialize};

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
