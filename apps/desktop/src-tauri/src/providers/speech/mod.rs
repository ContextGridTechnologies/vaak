use async_trait::async_trait;

use crate::providers::credentials;
use crate::providers::errors::{ProviderError, ProviderFailure};
use crate::providers::{ProviderStatus, TranscriptResult, TranscriptionInput};
use crate::storage::LocalSettingsStore;

mod azure;
mod elevenlabs;
mod gemini;
mod openai;

#[async_trait]
pub trait SpeechProvider {
    async fn transcribe(
        &self,
        api_key: String,
        input: TranscriptionInput,
    ) -> Result<TranscriptResult, ProviderError>;
}

pub fn provider_status(
    provider_id: &str,
    settings: &LocalSettingsStore,
) -> Result<ProviderStatus, ProviderError> {
    validate_provider_id(provider_id)?;
    Ok(ProviderStatus {
        provider_id: provider_id.to_string(),
        configured: credentials::has_provider_key(provider_id)?,
        config_complete: is_config_complete(provider_id, settings)?,
    })
}

pub async fn transcribe(
    provider_id: &str,
    input: TranscriptionInput,
    settings: &LocalSettingsStore,
) -> Result<TranscriptResult, ProviderError> {
    let api_key = credentials::provider_key(provider_id)?;

    match provider_id {
        openai::PROVIDER_ID => {
            openai::OpenAiSpeechProvider::default()
                .transcribe(api_key, input)
                .await
        }
        azure::PROVIDER_ID => {
            azure::AzureOpenAiSpeechProvider::new(
                settings
                    .provider_config_or_migrate(provider_id, || {
                        credentials::legacy_provider_config(provider_id)
                    })?
                    .ok_or_else(|| ProviderFailure::MissingConfiguration)?,
            )?
            .transcribe(api_key, input)
            .await
        }
        gemini::PROVIDER_ID | elevenlabs::PROVIDER_ID => {
            Err(ProviderFailure::UnsupportedProvider.into())
        }
        _ => Err(ProviderFailure::UnsupportedProvider.into()),
    }
}

pub fn validate_provider_id(provider_id: &str) -> Result<(), ProviderError> {
    match provider_id {
        openai::PROVIDER_ID
        | azure::PROVIDER_ID
        | gemini::PROVIDER_ID
        | elevenlabs::PROVIDER_ID => Ok(()),
        _ => Err(ProviderFailure::UnsupportedProvider.into()),
    }
}

fn is_config_complete(
    provider_id: &str,
    settings: &LocalSettingsStore,
) -> Result<bool, ProviderError> {
    if provider_id == openai::PROVIDER_ID {
        return Ok(true);
    }

    if provider_id == azure::PROVIDER_ID {
        return Ok(settings
            .provider_config_or_migrate(provider_id, || {
                credentials::legacy_provider_config(provider_id)
            })?
            .map(|config| azure::AzureOpenAiSpeechProvider::config_complete(&config))
            .unwrap_or(false));
    }

    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::ProviderConfig;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEST_DIR_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_config_dir(name: &str) -> PathBuf {
        let id = TEST_DIR_COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "vaak-speech-provider-test-{name}-{}-{id}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn openai_config_is_complete_without_local_provider_settings() {
        let settings = LocalSettingsStore::new(&temp_config_dir("openai"));

        assert!(is_config_complete("openai", &settings).unwrap());
    }

    #[test]
    fn azure_config_is_complete_only_when_required_fields_are_saved() {
        let dir = temp_config_dir("azure");
        let settings = LocalSettingsStore::new(&dir);

        settings
            .save_provider_config(
                "azure-openai",
                &ProviderConfig {
                    endpoint: Some("https://example.openai.azure.com".to_string()),
                    deployment_id: None,
                    api_version: Some("2025-04-01-preview".to_string()),
                },
            )
            .unwrap();

        assert!(!is_config_complete("azure-openai", &settings).unwrap());

        settings
            .save_provider_config(
                "azure-openai",
                &ProviderConfig {
                    endpoint: Some("https://example.openai.azure.com".to_string()),
                    deployment_id: Some("gpt-4o-mini-transcribe".to_string()),
                    api_version: Some("2025-04-01-preview".to_string()),
                },
            )
            .unwrap();

        assert!(is_config_complete("azure-openai", &settings).unwrap());
    }

    #[test]
    fn unsupported_speech_adapters_are_not_config_complete() {
        let settings = LocalSettingsStore::new(&temp_config_dir("unsupported"));

        assert!(!is_config_complete("gemini", &settings).unwrap());
        assert!(!is_config_complete("elevenlabs", &settings).unwrap());
    }
}
