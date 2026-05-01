use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::providers::errors::{ProviderError, ProviderFailure};
use crate::providers::ProviderConfig;

const SETTINGS_FILE_NAME: &str = "settings.json";
const SETTINGS_VERSION: u32 = 1;
const DEFAULT_SPEECH_PROVIDER: &str = "openai";

#[derive(Debug)]
pub struct LocalSettingsStore {
    settings_path: PathBuf,
    lock: Mutex<()>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalSettings {
    #[serde(default = "default_version")]
    version: u32,
    #[serde(default = "default_selected_speech_provider")]
    selected_speech_provider: String,
    #[serde(default)]
    provider_configs: BTreeMap<String, ProviderConfig>,
    #[serde(default)]
    onboarding: OnboardingState,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingState {
    pub completed: bool,
    pub current_step: String,
    pub selected_mode: Option<String>,
}

impl Default for OnboardingState {
    fn default() -> Self {
        Self {
            completed: false,
            current_step: "modeChoice".to_string(),
            selected_mode: None,
        }
    }
}

impl Default for LocalSettings {
    fn default() -> Self {
        Self {
            version: SETTINGS_VERSION,
            selected_speech_provider: default_selected_speech_provider(),
            provider_configs: BTreeMap::new(),
            onboarding: OnboardingState::default(),
        }
    }
}

impl LocalSettingsStore {
    pub fn new(config_dir: impl AsRef<Path>) -> Self {
        Self {
            settings_path: config_dir.as_ref().join(SETTINGS_FILE_NAME),
            lock: Mutex::new(()),
        }
    }

    pub fn from_app(app: &AppHandle) -> Result<Self, ProviderError> {
        let config_dir = app
            .path()
            .app_config_dir()
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        Ok(Self::new(config_dir))
    }

    pub fn selected_speech_provider_or_migrate<F>(
        &self,
        legacy_reader: F,
    ) -> Result<String, ProviderError>
    where
        F: FnOnce() -> Result<Option<String>, ProviderError>,
    {
        let _guard = self.lock()?;
        let mut settings = self.load_unlocked()?;
        if settings.selected_speech_provider != DEFAULT_SPEECH_PROVIDER {
            return Ok(settings.selected_speech_provider);
        }

        if let Some(provider_id) = legacy_reader()? {
            let provider_id = provider_id.trim().to_string();
            if !provider_id.is_empty() {
                settings.selected_speech_provider = provider_id.clone();
                self.save_unlocked(&settings)?;
                return Ok(provider_id);
            }
        }

        Ok(settings.selected_speech_provider)
    }

    pub fn save_selected_speech_provider(&self, provider_id: &str) -> Result<(), ProviderError> {
        let _guard = self.lock()?;
        let mut settings = self.load_unlocked()?;
        settings.selected_speech_provider = provider_id.to_string();
        self.save_unlocked(&settings)
    }

    pub fn provider_config_or_migrate<F>(
        &self,
        provider_id: &str,
        legacy_reader: F,
    ) -> Result<Option<ProviderConfig>, ProviderError>
    where
        F: FnOnce() -> Result<Option<ProviderConfig>, ProviderError>,
    {
        let _guard = self.lock()?;
        let mut settings = self.load_unlocked()?;
        if let Some(config) = settings.provider_configs.get(provider_id) {
            return Ok(Some(config.clone()));
        }

        if let Some(config) = legacy_reader()? {
            settings
                .provider_configs
                .insert(provider_id.to_string(), config.clone());
            self.save_unlocked(&settings)?;
            return Ok(Some(config));
        }

        Ok(None)
    }

    pub fn save_provider_config(
        &self,
        provider_id: &str,
        config: &ProviderConfig,
    ) -> Result<(), ProviderError> {
        let _guard = self.lock()?;
        let mut settings = self.load_unlocked()?;
        settings
            .provider_configs
            .insert(provider_id.to_string(), config.clone());
        self.save_unlocked(&settings)
    }

    pub fn onboarding_state(&self) -> Result<OnboardingState, ProviderError> {
        let _guard = self.lock()?;
        Ok(self.load_unlocked()?.onboarding)
    }

    pub fn save_onboarding_mode(&self, mode: &str) -> Result<OnboardingState, ProviderError> {
        let mode = mode.trim();
        if !matches!(mode, "local" | "sync" | "managed") {
            return Err(
                ProviderFailure::InvalidRequest("unsupported onboarding mode".to_string()).into(),
            );
        }

        let _guard = self.lock()?;
        let mut settings = self.load_unlocked()?;
        settings.onboarding.selected_mode = Some(mode.to_string());
        settings.onboarding.current_step = "desktopReadiness".to_string();
        settings.onboarding.completed = false;
        self.save_unlocked(&settings)?;
        Ok(settings.onboarding)
    }

    fn load_unlocked(&self) -> Result<LocalSettings, ProviderError> {
        if !self.settings_path.exists() {
            return Ok(LocalSettings::default());
        }

        let raw = fs::read_to_string(&self.settings_path)
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        serde_json::from_str::<LocalSettings>(&raw)
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()).into())
    }

    fn save_unlocked(&self, settings: &LocalSettings) -> Result<(), ProviderError> {
        if let Some(parent) = self.settings_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        }

        let raw = serde_json::to_string_pretty(settings)
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        fs::write(&self.settings_path, raw)
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()).into())
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, ()>, ProviderError> {
        self.lock
            .lock()
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()).into())
    }
}

fn default_version() -> u32 {
    SETTINGS_VERSION
}

fn default_selected_speech_provider() -> String {
    DEFAULT_SPEECH_PROVIDER.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::ProviderConfig;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_config_dir(name: &str) -> std::path::PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        std::env::temp_dir().join(format!("vaak-settings-{name}-{suffix}"))
    }

    #[test]
    fn missing_settings_file_uses_defaults() {
        let dir = temp_config_dir("defaults");
        let store = LocalSettingsStore::new(&dir);

        assert_eq!(
            store
                .selected_speech_provider_or_migrate(|| Ok(None))
                .unwrap(),
            "openai"
        );
        assert!(store
            .provider_config_or_migrate("azure-openai", || Ok(None))
            .unwrap()
            .is_none());
    }

    #[test]
    fn saves_selected_provider_and_provider_config_to_json() {
        let dir = temp_config_dir("save");
        let store = LocalSettingsStore::new(&dir);
        let config = ProviderConfig {
            endpoint: Some("https://example.openai.azure.com".to_string()),
            deployment_id: Some("whisper".to_string()),
            api_version: Some("2025-04-01-preview".to_string()),
        };

        store.save_selected_speech_provider("azure-openai").unwrap();
        store.save_provider_config("azure-openai", &config).unwrap();

        let reloaded = LocalSettingsStore::new(&dir);
        assert_eq!(
            reloaded
                .selected_speech_provider_or_migrate(|| Ok(None))
                .unwrap(),
            "azure-openai"
        );
        assert_eq!(
            reloaded
                .provider_config_or_migrate("azure-openai", || Ok(None))
                .unwrap(),
            Some(config)
        );

        let json = fs::read_to_string(dir.join("settings.json")).unwrap();
        assert!(json.contains("\"version\""));
        assert!(json.contains("\"selectedSpeechProvider\""));
        assert!(json.contains("\"providerConfigs\""));
        assert!(!json.contains("apiKey"));
    }

    #[test]
    fn migrates_provider_config_when_local_config_is_missing() {
        let dir = temp_config_dir("migrate-config");
        let store = LocalSettingsStore::new(&dir);
        let legacy_config = ProviderConfig {
            endpoint: Some("https://legacy.openai.azure.com".to_string()),
            deployment_id: Some("legacy-deployment".to_string()),
            api_version: Some("2025-04-01-preview".to_string()),
        };

        let migrated = store
            .provider_config_or_migrate("azure-openai", || Ok(Some(legacy_config.clone())))
            .unwrap();

        assert_eq!(migrated, Some(legacy_config.clone()));
        assert_eq!(
            LocalSettingsStore::new(&dir)
                .provider_config_or_migrate("azure-openai", || {
                    panic!("legacy reader should not be called after migration")
                })
                .unwrap(),
            Some(legacy_config)
        );
    }

    #[test]
    fn local_provider_config_wins_over_legacy_config() {
        let dir = temp_config_dir("local-wins");
        let store = LocalSettingsStore::new(&dir);
        let local_config = ProviderConfig {
            endpoint: Some("https://local.openai.azure.com".to_string()),
            deployment_id: Some("local-deployment".to_string()),
            api_version: Some("2025-04-01-preview".to_string()),
        };

        store
            .save_provider_config("azure-openai", &local_config)
            .unwrap();

        let loaded = store
            .provider_config_or_migrate("azure-openai", || {
                panic!("legacy reader should not be called when local config exists")
            })
            .unwrap();

        assert_eq!(loaded, Some(local_config));
    }

    #[test]
    fn persists_onboarding_mode_in_local_settings() {
        let dir = temp_config_dir("onboarding-mode");
        let store = LocalSettingsStore::new(&dir);

        let initial = store.onboarding_state().unwrap();
        assert!(!initial.completed);
        assert_eq!(initial.current_step, "modeChoice");
        assert_eq!(initial.selected_mode, None);

        let saved = store.save_onboarding_mode("local").unwrap();
        assert!(!saved.completed);
        assert_eq!(saved.current_step, "desktopReadiness");
        assert_eq!(saved.selected_mode.as_deref(), Some("local"));

        let reloaded = LocalSettingsStore::new(&dir).onboarding_state().unwrap();
        assert_eq!(reloaded.current_step, "desktopReadiness");
        assert_eq!(reloaded.selected_mode.as_deref(), Some("local"));

        let json = fs::read_to_string(dir.join("settings.json")).unwrap();
        assert!(json.contains("\"onboarding\""));
        assert!(json.contains("\"selectedMode\""));
    }
}
