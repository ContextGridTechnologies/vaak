use std::collections::BTreeMap;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use super::dictation_records::LocalIdentity;
use crate::providers::errors::{ProviderError, ProviderFailure};
use crate::providers::ProviderConfig;
use crate::session::{
    command_binding_label, normalize_dictation_hotkey_label, HotkeyBindings,
    DEFAULT_DICTATION_BINDING_LABEL,
};
use uuid::Uuid;

const SETTINGS_FILE_NAME: &str = "settings.json";
const SETTINGS_BACKUP_FILE_NAME: &str = "settings.last-known-good.json";
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
    transcription_prompt: Option<String>,
    #[serde(default)]
    microphone_selection: MicrophoneSelection,
    #[serde(default)]
    hotkeys: HotkeySettings,
    #[serde(default)]
    onboarding: OnboardingState,
    #[serde(default)]
    app_shell: AppShellPreferences,
    #[serde(default)]
    system: SystemSettings,
    #[serde(default)]
    identity: Option<LocalIdentity>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct HotkeySettings {
    #[serde(default = "default_dictation_hotkey")]
    dictation: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingState {
    pub completed: bool,
    pub current_step: String,
    pub selected_mode: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppShellPreferences {
    pub sidebar_collapsed: bool,
    #[serde(default = "default_voice_capsule_enabled")]
    pub voice_capsule_enabled: bool,
    #[serde(default = "default_voice_capsule_placement_option")]
    pub voice_capsule_placement: Option<VoiceCapsulePlacement>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSettings {
    #[serde(default = "default_dictation_mode")]
    pub dictation_mode: String,
    #[serde(default = "default_launch_on_startup")]
    pub launch_on_startup: bool,
    #[serde(default)]
    pub show_skipped_transcripts: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceCapsulePlacement {
    #[serde(default)]
    pub anchor: VoiceCapsuleAnchor,
    #[serde(default)]
    pub offset_x: Option<f64>,
    #[serde(default)]
    pub offset_y: Option<f64>,
    #[serde(default)]
    pub monitor: Option<VoiceCapsuleMonitorMetadata>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceCapsuleMonitorMetadata {
    pub work_area_x: f64,
    pub work_area_y: f64,
    pub work_area_width: f64,
    pub work_area_height: f64,
    #[serde(default)]
    pub scale_factor: Option<f64>,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum VoiceCapsuleAnchor {
    #[default]
    BottomCenter,
    BottomLeft,
    BottomRight,
    CenterLeft,
    CenterRight,
    TopCenter,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", tag = "mode")]
pub enum MicrophoneSelection {
    #[serde(rename = "system")]
    System,
    #[serde(rename = "manual")]
    Manual {
        #[serde(rename = "deviceId")]
        device_id: String,
    },
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

impl Default for AppShellPreferences {
    fn default() -> Self {
        Self {
            sidebar_collapsed: false,
            voice_capsule_enabled: default_voice_capsule_enabled(),
            voice_capsule_placement: default_voice_capsule_placement_option(),
        }
    }
}

impl Default for VoiceCapsulePlacement {
    fn default() -> Self {
        Self {
            anchor: VoiceCapsuleAnchor::BottomCenter,
            offset_x: None,
            offset_y: None,
            monitor: None,
        }
    }
}

impl Default for LocalSettings {
    fn default() -> Self {
        Self {
            version: SETTINGS_VERSION,
            selected_speech_provider: default_selected_speech_provider(),
            provider_configs: BTreeMap::new(),
            transcription_prompt: None,
            microphone_selection: MicrophoneSelection::default(),
            hotkeys: HotkeySettings::default(),
            onboarding: OnboardingState::default(),
            app_shell: AppShellPreferences::default(),
            system: SystemSettings::default(),
            identity: None,
        }
    }
}

impl Default for MicrophoneSelection {
    fn default() -> Self {
        Self::System
    }
}

impl Default for HotkeySettings {
    fn default() -> Self {
        Self {
            dictation: default_dictation_hotkey(),
        }
    }
}

impl Default for SystemSettings {
    fn default() -> Self {
        Self {
            dictation_mode: default_dictation_mode(),
            launch_on_startup: default_launch_on_startup(),
            show_skipped_transcripts: false,
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

    pub fn transcription_prompt(&self) -> Result<Option<String>, ProviderError> {
        let _guard = self.lock()?;
        Ok(self.load_unlocked()?.transcription_prompt)
    }

    pub fn save_transcription_prompt(&self, prompt: &str) -> Result<(), ProviderError> {
        let _guard = self.lock()?;
        let mut settings = self.load_unlocked()?;
        settings.transcription_prompt = match prompt.trim() {
            "" => None,
            prompt => Some(prompt.to_string()),
        };
        self.save_unlocked(&settings)
    }

    pub fn onboarding_state(&self) -> Result<OnboardingState, ProviderError> {
        let _guard = self.lock()?;
        self.load_onboarding_unlocked()
    }

    pub fn app_shell_preferences(&self) -> Result<AppShellPreferences, ProviderError> {
        let _guard = self.lock()?;
        Ok(normalize_app_shell_preferences(
            self.load_unlocked()?.app_shell,
        ))
    }

    pub fn save_app_shell_preferences(
        &self,
        preferences: AppShellPreferences,
    ) -> Result<AppShellPreferences, ProviderError> {
        let _guard = self.lock()?;
        let mut settings = self.load_unlocked()?;
        settings.app_shell = normalize_app_shell_preferences(preferences);
        self.save_unlocked(&settings)?;
        Ok(settings.app_shell)
    }

    pub fn save_voice_capsule_enabled(
        &self,
        enabled: bool,
    ) -> Result<AppShellPreferences, ProviderError> {
        let _guard = self.lock()?;
        let mut settings = self.load_unlocked()?;
        settings.app_shell = normalize_app_shell_preferences(settings.app_shell);
        settings.app_shell.voice_capsule_enabled = enabled;
        self.save_unlocked(&settings)?;
        Ok(settings.app_shell)
    }

    pub fn system_settings(&self) -> Result<SystemSettings, ProviderError> {
        let _guard = self.lock()?;
        Ok(self.load_unlocked()?.system)
    }

    pub fn save_system_settings(
        &self,
        system_settings: SystemSettings,
    ) -> Result<SystemSettings, ProviderError> {
        let system_settings = normalize_system_settings(system_settings)?;
        let _guard = self.lock()?;
        let mut settings = self.load_unlocked()?;
        settings.system = system_settings;
        self.save_unlocked(&settings)?;
        Ok(settings.system)
    }

    pub fn microphone_selection(&self) -> Result<MicrophoneSelection, ProviderError> {
        let _guard = self.lock()?;
        Ok(self.load_unlocked()?.microphone_selection)
    }

    pub fn hotkey_bindings(&self) -> Result<HotkeyBindings, ProviderError> {
        let _guard = self.lock()?;
        let settings = self.load_unlocked()?;
        build_hotkey_bindings(&settings.hotkeys.dictation)
    }

    pub fn save_dictation_hotkey(&self, shortcut: &str) -> Result<HotkeyBindings, ProviderError> {
        let normalized = normalize_dictation_hotkey_label(shortcut)
            .map_err(|message| ProviderFailure::InvalidRequest(message))?;

        let _guard = self.lock()?;
        let mut settings = self.load_unlocked()?;
        settings.hotkeys.dictation = normalized.clone();
        self.save_unlocked(&settings)?;
        build_hotkey_bindings(&normalized)
    }

    pub fn save_microphone_selection(
        &self,
        selection: MicrophoneSelection,
    ) -> Result<MicrophoneSelection, ProviderError> {
        validate_microphone_selection(&selection)?;

        let _guard = self.lock()?;
        let mut settings = self.load_unlocked()?;
        settings.microphone_selection = selection;
        self.save_unlocked(&settings)?;
        Ok(settings.microphone_selection)
    }

    pub fn local_identity(&self) -> Result<LocalIdentity, ProviderError> {
        let _guard = self.lock()?;
        let mut settings = self.load_unlocked()?;
        if ensure_local_identity(&mut settings) {
            self.save_unlocked(&settings)?;
        }

        settings.identity.ok_or_else(|| {
            ProviderFailure::SettingsStore(
                "missing local identity after initialization".to_string(),
            )
            .into()
        })
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
        settings.onboarding.current_step = "microphoneReadiness".to_string();
        settings.onboarding.completed = false;
        self.save_unlocked(&settings)?;
        Ok(settings.onboarding)
    }

    pub fn save_onboarding_step(&self, step: &str) -> Result<OnboardingState, ProviderError> {
        let normalized_step = normalize_onboarding_step(step).ok_or_else(|| {
            ProviderFailure::InvalidRequest("unsupported onboarding step".to_string())
        })?;

        let _guard = self.lock()?;
        let mut settings = self.load_unlocked()?;
        settings.onboarding.current_step = normalized_step.to_string();
        settings.onboarding.completed = false;
        self.save_unlocked(&settings)?;
        Ok(settings.onboarding)
    }

    pub fn complete_onboarding(&self) -> Result<OnboardingState, ProviderError> {
        let _guard = self.lock()?;
        let mut settings = self.load_unlocked()?;
        settings.onboarding.completed = true;
        self.save_unlocked(&settings)?;
        Ok(settings.onboarding)
    }

    fn load_unlocked(&self) -> Result<LocalSettings, ProviderError> {
        if !self.settings_path.exists() {
            return Ok(LocalSettings::default());
        }

        match self.load_settings_from_path(&self.settings_path) {
            Ok(settings) => {
                self.refresh_backup_unlocked(&settings)?;
                Ok(settings)
            }
            Err(primary_err) => {
                let recovered = self.load_settings_from_path(&self.backup_path());
                match recovered {
                    Ok(settings) => {
                        self.save_unlocked(&settings)?;
                        Ok(settings)
                    }
                    Err(_) => Err(primary_err),
                }
            }
        }
    }

    fn load_onboarding_unlocked(&self) -> Result<OnboardingState, ProviderError> {
        if !self.settings_path.exists() {
            return Ok(OnboardingState::default());
        }

        match self.load_onboarding_from_path(&self.settings_path) {
            Ok(onboarding) => {
                if let Ok(settings) = self.load_settings_from_path(&self.settings_path) {
                    self.refresh_backup_unlocked(&settings)?;
                }
                Ok(onboarding)
            }
            Err(primary_err) => {
                let recovered = self.load_settings_from_path(&self.backup_path());
                match recovered {
                    Ok(settings) => {
                        let onboarding = normalize_onboarding_state(settings.onboarding.clone());
                        self.save_unlocked(&settings)?;
                        Ok(onboarding)
                    }
                    Err(_) => Err(primary_err),
                }
            }
        }
    }

    fn save_unlocked(&self, settings: &LocalSettings) -> Result<(), ProviderError> {
        if let Some(parent) = self.settings_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        }

        let raw = serde_json::to_string_pretty(settings)
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        let _validated = parse_settings(&raw)?;
        write_atomic(&self.settings_path, &raw)?;
        write_atomic(&self.backup_path(), &raw)
    }

    fn refresh_backup_unlocked(&self, settings: &LocalSettings) -> Result<(), ProviderError> {
        let backup_path = self.backup_path();
        if backup_path.exists() && self.load_settings_from_path(&backup_path).is_ok() {
            return Ok(());
        }

        let raw = serde_json::to_string_pretty(settings)
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        let _validated = parse_settings(&raw)?;
        write_atomic(&backup_path, &raw)
    }

    fn backup_path(&self) -> PathBuf {
        self.settings_path.with_file_name(SETTINGS_BACKUP_FILE_NAME)
    }

    fn load_settings_from_path(&self, path: &Path) -> Result<LocalSettings, ProviderError> {
        let raw = fs::read_to_string(path)
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        parse_settings(&raw)
    }

    fn load_onboarding_from_path(&self, path: &Path) -> Result<OnboardingState, ProviderError> {
        let raw = fs::read_to_string(path)
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        let value = serde_json::from_str::<serde_json::Value>(&raw)
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        let Some(onboarding_value) = value.get("onboarding") else {
            return Ok(OnboardingState::default());
        };
        let onboarding = serde_json::from_value::<OnboardingState>(onboarding_value.clone())
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;

        Ok(normalize_onboarding_state(onboarding))
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

fn default_dictation_hotkey() -> String {
    DEFAULT_DICTATION_BINDING_LABEL.to_string()
}

fn default_dictation_mode() -> String {
    "streaming".to_string()
}

fn default_voice_capsule_placement_option() -> Option<VoiceCapsulePlacement> {
    Some(VoiceCapsulePlacement::default())
}

fn default_voice_capsule_enabled() -> bool {
    true
}

fn default_launch_on_startup() -> bool {
    true
}

fn normalize_onboarding_step(step: &str) -> Option<&'static str> {
    match step.trim() {
        "modeChoice" => Some("modeChoice"),
        "desktopReadiness" | "microphoneReadiness" => Some("microphoneReadiness"),
        "providerSetup" => Some("providerSetup"),
        "providerTest" | "tryDictation" | "hotkeyReadiness" => Some("hotkeyReadiness"),
        _ => None,
    }
}

fn parse_settings(raw: &str) -> Result<LocalSettings, ProviderError> {
    let mut settings = serde_json::from_str::<LocalSettings>(raw)
        .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
    validate_microphone_selection(&settings.microphone_selection)?;
    settings.hotkeys.dictation = normalize_dictation_hotkey_label(&settings.hotkeys.dictation)
        .map_err(ProviderFailure::InvalidRequest)?;
    settings.system = normalize_system_settings(settings.system)?;
    settings.onboarding = normalize_onboarding_state(settings.onboarding);
    Ok(settings)
}

fn normalize_system_settings(
    mut settings: SystemSettings,
) -> Result<SystemSettings, ProviderError> {
    settings.dictation_mode = match settings.dictation_mode.as_str() {
        "auto" | "balanced" => "streaming".to_string(),
        "streaming" | "fast" => "streaming".to_string(),
        "standard" | "accurate" => "standard".to_string(),
        _ => {
            return Err(
                ProviderFailure::InvalidRequest("unsupported dictation mode".to_string()).into(),
            );
        }
    };
    Ok(settings)
}

fn write_atomic(path: &Path, raw: &str) -> Result<(), ProviderError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
    }

    let temp_path = temporary_settings_path(path);
    let write_result = (|| -> Result<(), ProviderError> {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temp_path)
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        file.write_all(raw.as_bytes())
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        file.sync_all()
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        drop(file);
        replace_file(&temp_path, path)?;
        if let Some(parent) = path.parent() {
            sync_parent_dir(parent);
        }
        Ok(())
    })();

    if write_result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }

    write_result
}

fn temporary_settings_path(path: &Path) -> PathBuf {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("settings.json");
    path.with_file_name(format!("{file_name}.tmp-{}", Uuid::new_v4()))
}

#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> Result<(), ProviderError> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let source_wide: Vec<u16> = source
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let destination_wide: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let moved = unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            destination_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if moved == 0 {
        return Err(
            ProviderFailure::SettingsStore(std::io::Error::last_os_error().to_string()).into(),
        );
    }

    Ok(())
}

#[cfg(not(windows))]
fn replace_file(source: &Path, destination: &Path) -> Result<(), ProviderError> {
    fs::rename(source, destination)
        .map_err(|err| ProviderFailure::SettingsStore(err.to_string()).into())
}

fn sync_parent_dir(parent: &Path) {
    if let Ok(dir) = File::open(parent) {
        let _ = dir.sync_all();
    }
}

fn normalize_onboarding_state(mut state: OnboardingState) -> OnboardingState {
    state.current_step = normalize_onboarding_step(&state.current_step)
        .unwrap_or("modeChoice")
        .to_string();
    state
}

fn build_hotkey_bindings(dictation: &str) -> Result<HotkeyBindings, ProviderError> {
    Ok(HotkeyBindings {
        command: command_binding_label(dictation).map_err(ProviderFailure::InvalidRequest)?,
        dictation: dictation.to_string(),
    })
}

fn normalize_app_shell_preferences(mut preferences: AppShellPreferences) -> AppShellPreferences {
    if preferences.voice_capsule_placement.is_none() {
        preferences.voice_capsule_placement = default_voice_capsule_placement_option();
    }

    preferences
}

fn ensure_local_identity(settings: &mut LocalSettings) -> bool {
    if settings.identity.is_some() {
        return false;
    }

    settings.identity = Some(LocalIdentity {
        user_id: Uuid::new_v4().to_string(),
        installation_id: Uuid::new_v4().to_string(),
        device_id: Uuid::new_v4().to_string(),
    });
    true
}

fn validate_microphone_selection(selection: &MicrophoneSelection) -> Result<(), ProviderError> {
    match selection {
        MicrophoneSelection::System => Ok(()),
        MicrophoneSelection::Manual { device_id } if !device_id.trim().is_empty() => Ok(()),
        MicrophoneSelection::Manual { .. } => Err(ProviderFailure::InvalidRequest(
            "manual microphone selection requires a device id".to_string(),
        )
        .into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::ProviderConfig;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};
    use uuid::Uuid;

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
    fn persists_transcription_prompt() {
        let dir = temp_config_dir("transcription-prompt");
        let store = LocalSettingsStore::new(&dir);

        store
            .save_transcription_prompt("Keep names exact.")
            .unwrap();

        assert_eq!(
            LocalSettingsStore::new(&dir)
                .transcription_prompt()
                .unwrap()
                .as_deref(),
            Some("Keep names exact.")
        );
    }

    #[test]
    fn saves_selected_provider_and_provider_config_without_provider_secrets() {
        let dir = temp_config_dir("save");
        let store = LocalSettingsStore::new(&dir);
        let provider_key_value = "sk-test-openai-secret";
        let assemblyai_key_value = "assemblyai-test-secret";
        let config = ProviderConfig {
            endpoint: Some("https://example.openai.azure.com".to_string()),
            deployment_id: Some("whisper".to_string()),
            streaming_deployment_id: None,
            api_version: Some("2025-04-01-preview".to_string()),
            model: Some("gpt-4o-mini-transcribe".to_string()),
            transcription_mode: None,
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
        assert!(json.contains("gpt-4o-mini-transcribe"));
        assert_no_provider_secrets(&json, &[provider_key_value, assemblyai_key_value]);
    }

    #[test]
    fn migrates_provider_config_when_local_config_is_missing() {
        let dir = temp_config_dir("migrate-config");
        let store = LocalSettingsStore::new(&dir);
        let legacy_config = ProviderConfig {
            endpoint: Some("https://legacy.openai.azure.com".to_string()),
            deployment_id: Some("legacy-deployment".to_string()),
            streaming_deployment_id: None,
            api_version: Some("2025-04-01-preview".to_string()),
            model: None,
            transcription_mode: None,
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
            streaming_deployment_id: None,
            api_version: Some("2025-04-01-preview".to_string()),
            model: None,
            transcription_mode: None,
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
        assert_eq!(saved.current_step, "microphoneReadiness");
        assert_eq!(saved.selected_mode.as_deref(), Some("local"));

        let reloaded = LocalSettingsStore::new(&dir).onboarding_state().unwrap();
        assert_eq!(reloaded.current_step, "microphoneReadiness");
        assert_eq!(reloaded.selected_mode.as_deref(), Some("local"));

        let json = fs::read_to_string(dir.join("settings.json")).unwrap();
        assert!(json.contains("\"onboarding\""));
        assert!(json.contains("\"selectedMode\""));
    }

    #[test]
    fn migrates_legacy_desktop_readiness_step_to_microphone_readiness() {
        let dir = temp_config_dir("onboarding-migrate-step");
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("settings.json"),
            r#"{
  "version": 1,
  "selectedSpeechProvider": "openai",
  "providerConfigs": {},
  "onboarding": {
    "completed": false,
    "currentStep": "desktopReadiness",
    "selectedMode": "local"
  }
}"#,
        )
        .unwrap();

        let state = LocalSettingsStore::new(&dir).onboarding_state().unwrap();

        assert_eq!(state.current_step, "microphoneReadiness");
        assert_eq!(state.selected_mode.as_deref(), Some("local"));
    }

    #[test]
    fn migrates_legacy_provider_and_dictation_steps_to_hotkey_readiness() {
        let dir = temp_config_dir("onboarding-migrate-hotkey-step");
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("settings.json"),
            r#"{
  "version": 1,
  "selectedSpeechProvider": "openai",
  "providerConfigs": {},
  "onboarding": {
    "completed": false,
    "currentStep": "providerTest",
    "selectedMode": "local"
  }
}"#,
        )
        .unwrap();

        let state = LocalSettingsStore::new(&dir).onboarding_state().unwrap();

        assert_eq!(state.current_step, "hotkeyReadiness");
        assert_eq!(state.selected_mode.as_deref(), Some("local"));

        fs::write(
            dir.join("settings.json"),
            r#"{
  "version": 1,
  "selectedSpeechProvider": "openai",
  "providerConfigs": {},
  "onboarding": {
    "completed": false,
    "currentStep": "tryDictation",
    "selectedMode": "local"
  }
}"#,
        )
        .unwrap();

        let migrated = LocalSettingsStore::new(&dir).onboarding_state().unwrap();

        assert_eq!(migrated.current_step, "hotkeyReadiness");
    }

    #[test]
    fn saves_onboarding_step_progress_in_local_settings() {
        let dir = temp_config_dir("onboarding-step");
        let store = LocalSettingsStore::new(&dir);

        store.save_onboarding_mode("local").unwrap();
        let saved = store.save_onboarding_step("hotkeyReadiness").unwrap();

        assert!(!saved.completed);
        assert_eq!(saved.current_step, "hotkeyReadiness");
        assert_eq!(saved.selected_mode.as_deref(), Some("local"));

        let reloaded = LocalSettingsStore::new(&dir).onboarding_state().unwrap();
        assert_eq!(reloaded.current_step, "hotkeyReadiness");
        assert_eq!(reloaded.selected_mode.as_deref(), Some("local"));
    }

    #[test]
    fn completes_onboarding_in_local_settings() {
        let dir = temp_config_dir("onboarding-complete");
        let store = LocalSettingsStore::new(&dir);

        store.save_onboarding_mode("local").unwrap();
        store.save_onboarding_step("hotkeyReadiness").unwrap();
        let saved = store.complete_onboarding().unwrap();

        assert!(saved.completed);
        assert_eq!(saved.current_step, "hotkeyReadiness");
        assert_eq!(saved.selected_mode.as_deref(), Some("local"));

        let reloaded = LocalSettingsStore::new(&dir).onboarding_state().unwrap();
        assert!(reloaded.completed);
        assert_eq!(reloaded.current_step, "hotkeyReadiness");
    }

    #[test]
    fn persists_dictation_hotkey_in_local_settings() {
        let dir = temp_config_dir("dictation-hotkey");
        let store = LocalSettingsStore::new(&dir);

        let saved = store.save_dictation_hotkey("Ctrl+Shift").unwrap();

        assert_eq!(saved.dictation, "Ctrl+Shift");
        assert_eq!(saved.command, "Ctrl+Shift+Alt");

        let reloaded = LocalSettingsStore::new(&dir).hotkey_bindings().unwrap();
        assert_eq!(reloaded.dictation, "Ctrl+Shift");
        assert_eq!(reloaded.command, "Ctrl+Shift+Alt");

        let json = fs::read_to_string(dir.join("settings.json")).unwrap();
        assert!(json.contains("\"hotkeys\""));
        assert!(json.contains("\"dictation\": \"Ctrl+Shift\""));
    }

    #[test]
    fn generates_and_persists_local_identity() {
        let dir = temp_config_dir("local-identity");
        let store = LocalSettingsStore::new(&dir);

        let identity = store.local_identity().unwrap();

        assert!(Uuid::parse_str(&identity.user_id).is_ok());
        assert!(Uuid::parse_str(&identity.installation_id).is_ok());
        assert!(Uuid::parse_str(&identity.device_id).is_ok());

        let reloaded = LocalSettingsStore::new(&dir).local_identity().unwrap();
        assert_eq!(reloaded, identity);

        let json = fs::read_to_string(dir.join("settings.json")).unwrap();
        assert!(json.contains("\"identity\""));
        assert!(json.contains(&identity.user_id));
        assert!(json.contains(&identity.installation_id));
    }

    #[test]
    fn backfills_identity_into_existing_settings_files() {
        let dir = temp_config_dir("identity-migration");
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("settings.json"),
            r#"{
  "version": 1,
  "selectedSpeechProvider": "openai",
  "providerConfigs": {},
  "hotkeys": {
    "dictation": "Ctrl+Win"
  },
  "onboarding": {
    "completed": false,
    "currentStep": "modeChoice",
    "selectedMode": null
  }
}"#,
        )
        .unwrap();

        let identity = LocalSettingsStore::new(&dir).local_identity().unwrap();

        assert!(Uuid::parse_str(&identity.user_id).is_ok());
        assert!(Uuid::parse_str(&identity.installation_id).is_ok());
        assert!(Uuid::parse_str(&identity.device_id).is_ok());

        let json = fs::read_to_string(dir.join("settings.json")).unwrap();
        assert!(json.contains("\"identity\""));
        assert!(json.contains("\"dictation\": \"Ctrl+Win\""));
    }

    #[test]
    fn microphone_selection_defaults_to_system() {
        let dir = temp_config_dir("microphone-default");
        let store = LocalSettingsStore::new(&dir);

        assert_eq!(
            store.microphone_selection().unwrap(),
            MicrophoneSelection::System
        );
    }

    #[test]
    fn app_shell_preferences_default_to_expanded_sidebar() {
        let dir = temp_config_dir("app-shell-defaults");
        let store = LocalSettingsStore::new(&dir);

        let preferences = store.app_shell_preferences().unwrap();

        assert!(!preferences.sidebar_collapsed);
        assert!(preferences.voice_capsule_enabled);
        assert_eq!(
            preferences.voice_capsule_placement,
            Some(VoiceCapsulePlacement::default())
        );
    }

    #[test]
    fn system_settings_default_to_launch_on_startup() {
        let dir = temp_config_dir("system-settings-defaults");
        let store = LocalSettingsStore::new(&dir);

        let settings = store.system_settings().unwrap();

        assert_eq!(settings.dictation_mode, "streaming");
        assert!(settings.launch_on_startup);
        assert!(!settings.show_skipped_transcripts);
    }

    #[test]
    fn persists_system_startup_preference() {
        let dir = temp_config_dir("system-settings-startup");
        let store = LocalSettingsStore::new(&dir);

        let saved = store
            .save_system_settings(SystemSettings {
                dictation_mode: "accurate".to_string(),
                launch_on_startup: false,
                show_skipped_transcripts: true,
            })
            .unwrap();

        assert_eq!(saved.dictation_mode, "standard");
        assert!(!saved.launch_on_startup);
        assert!(saved.show_skipped_transcripts);
        assert!(
            !LocalSettingsStore::new(&dir)
                .system_settings()
                .unwrap()
                .launch_on_startup
        );

        let json = fs::read_to_string(dir.join("settings.json")).unwrap();
        assert!(json.contains("\"system\""));
        assert!(json.contains("\"dictationMode\": \"standard\""));
        assert!(json.contains("\"launchOnStartup\": false"));
        assert!(json.contains("\"showSkippedTranscripts\": true"));
    }

    #[test]
    fn rejects_invalid_dictation_mode() {
        let dir = temp_config_dir("invalid-dictation-mode");
        let store = LocalSettingsStore::new(&dir);

        let err = store
            .save_system_settings(SystemSettings {
                dictation_mode: "turbo".to_string(),
                launch_on_startup: true,
                show_skipped_transcripts: false,
            })
            .unwrap_err();

        assert_eq!(err.code, "invalid_provider_request");
    }

    #[test]
    fn persists_app_shell_sidebar_collapse_preference() {
        let dir = temp_config_dir("app-shell-sidebar");
        let store = LocalSettingsStore::new(&dir);

        let saved = store
            .save_app_shell_preferences(AppShellPreferences {
                sidebar_collapsed: true,
                voice_capsule_enabled: true,
                voice_capsule_placement: Some(VoiceCapsulePlacement {
                    anchor: VoiceCapsuleAnchor::BottomRight,
                    offset_x: Some(32.0),
                    offset_y: Some(20.0),
                    monitor: None,
                }),
            })
            .unwrap();

        assert!(saved.sidebar_collapsed);
        assert_eq!(
            saved.voice_capsule_placement,
            Some(VoiceCapsulePlacement {
                anchor: VoiceCapsuleAnchor::BottomRight,
                offset_x: Some(32.0),
                offset_y: Some(20.0),
                monitor: None,
            })
        );
        assert!(
            LocalSettingsStore::new(&dir)
                .app_shell_preferences()
                .unwrap()
                .sidebar_collapsed
        );
        assert!(
            LocalSettingsStore::new(&dir)
                .app_shell_preferences()
                .unwrap()
                .voice_capsule_enabled
        );
        assert_eq!(
            LocalSettingsStore::new(&dir)
                .app_shell_preferences()
                .unwrap()
                .voice_capsule_placement,
            Some(VoiceCapsulePlacement {
                anchor: VoiceCapsuleAnchor::BottomRight,
                offset_x: Some(32.0),
                offset_y: Some(20.0),
                monitor: None,
            })
        );

        let json = fs::read_to_string(dir.join("settings.json")).unwrap();
        assert!(json.contains("\"appShell\""));
        assert!(json.contains("\"sidebarCollapsed\": true"));
        assert!(json.contains("\"voiceCapsulePlacement\""));
        assert!(json.contains("\"bottomRight\""));
    }

    #[test]
    fn serializes_top_center_voice_capsule_anchor() {
        let placement: VoiceCapsulePlacement = serde_json::from_str(
            r#"{
  "anchor": "topCenter",
  "offsetX": 4.0,
  "offsetY": 20.0
}"#,
        )
        .unwrap();

        let json = serde_json::to_string(&placement).unwrap();

        assert!(json.contains("\"anchor\":\"topCenter\""));
        assert_eq!(
            placement,
            VoiceCapsulePlacement {
                anchor: VoiceCapsuleAnchor::TopCenter,
                offset_x: Some(4.0),
                offset_y: Some(20.0),
                monitor: None,
            }
        );
    }

    #[test]
    fn persists_voice_capsule_enabled_preference() {
        let dir = temp_config_dir("voice-capsule-enabled");
        let store = LocalSettingsStore::new(&dir);

        let disabled = store.save_voice_capsule_enabled(false).unwrap();
        assert!(!disabled.voice_capsule_enabled);
        assert!(
            !LocalSettingsStore::new(&dir)
                .app_shell_preferences()
                .unwrap()
                .voice_capsule_enabled
        );

        let enabled = LocalSettingsStore::new(&dir)
            .save_voice_capsule_enabled(true)
            .unwrap();
        assert!(enabled.voice_capsule_enabled);
    }

    #[test]
    fn serializes_voice_capsule_monitor_metadata_without_breaking_v1_placement() {
        let v1_placement: VoiceCapsulePlacement = serde_json::from_str(
            r#"{
  "anchor": "bottomCenter",
  "offsetX": 0.0,
  "offsetY": 24.0
}"#,
        )
        .unwrap();
        assert_eq!(v1_placement.monitor, None);

        let placement = VoiceCapsulePlacement {
            anchor: VoiceCapsuleAnchor::TopCenter,
            offset_x: Some(12.0),
            offset_y: Some(28.0),
            monitor: Some(VoiceCapsuleMonitorMetadata {
                work_area_x: 10.0,
                work_area_y: 20.0,
                work_area_width: 1200.0,
                work_area_height: 800.0,
                scale_factor: Some(1.25),
            }),
        };

        let json = serde_json::to_string(&placement).unwrap();
        let reloaded: VoiceCapsulePlacement = serde_json::from_str(&json).unwrap();

        assert!(json.contains("\"monitor\""));
        assert_eq!(reloaded, placement);
    }

    #[test]
    fn persists_manual_microphone_selection_in_local_settings() {
        let dir = temp_config_dir("microphone-manual");
        let store = LocalSettingsStore::new(&dir);

        let saved = store
            .save_microphone_selection(MicrophoneSelection::Manual {
                device_id: "usb-mic".to_string(),
            })
            .unwrap();

        assert_eq!(
            saved,
            MicrophoneSelection::Manual {
                device_id: "usb-mic".to_string()
            }
        );
        assert_eq!(
            LocalSettingsStore::new(&dir)
                .microphone_selection()
                .unwrap(),
            MicrophoneSelection::Manual {
                device_id: "usb-mic".to_string()
            }
        );

        let json = fs::read_to_string(dir.join("settings.json")).unwrap();
        assert!(json.contains("\"microphoneSelection\""));
        assert!(json.contains("\"mode\": \"manual\""));
        assert!(json.contains("\"deviceId\": \"usb-mic\""));
    }

    #[test]
    fn rejects_malformed_manual_microphone_selection_payloads() {
        let dir = temp_config_dir("microphone-invalid");
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("settings.json"),
            r#"{
  "version": 1,
  "selectedSpeechProvider": "openai",
  "providerConfigs": {},
  "microphoneSelection": {
    "mode": "manual",
    "deviceId": ""
  },
  "onboarding": {
    "completed": false,
    "currentStep": "modeChoice",
    "selectedMode": null
  }
}"#,
        )
        .unwrap();

        let err = LocalSettingsStore::new(&dir)
            .microphone_selection()
            .unwrap_err();

        assert_eq!(err.code, "invalid_provider_request");
    }

    #[test]
    fn onboarding_state_ignores_unrelated_invalid_microphone_selection() {
        let dir = temp_config_dir("onboarding-invalid-microphone");
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("settings.json"),
            r#"{
  "version": 1,
  "selectedSpeechProvider": "openai",
  "providerConfigs": {},
  "microphoneSelection": {
    "mode": "manual",
    "deviceId": ""
  },
  "onboarding": {
    "completed": true,
    "currentStep": "hotkeyReadiness",
    "selectedMode": "local"
  }
}"#,
        )
        .unwrap();

        let state = LocalSettingsStore::new(&dir).onboarding_state().unwrap();

        assert!(state.completed);
        assert_eq!(state.current_step, "hotkeyReadiness");
        assert_eq!(state.selected_mode.as_deref(), Some("local"));
    }

    #[test]
    fn truncated_primary_recovers_completed_onboarding_from_last_known_good_backup() {
        let dir = temp_config_dir("truncated-primary");
        let store = LocalSettingsStore::new(&dir);

        store.save_onboarding_mode("local").unwrap();
        let completed = store.complete_onboarding().unwrap();
        assert!(completed.completed);
        assert!(dir.join(SETTINGS_BACKUP_FILE_NAME).exists());

        fs::write(dir.join(SETTINGS_FILE_NAME), "{").unwrap();

        let recovered = LocalSettingsStore::new(&dir).onboarding_state().unwrap();
        assert!(recovered.completed);
        assert_eq!(recovered.selected_mode.as_deref(), Some("local"));
        let repaired_primary = fs::read_to_string(dir.join(SETTINGS_FILE_NAME)).unwrap();
        serde_json::from_str::<serde_json::Value>(&repaired_primary).unwrap();
        assert!(repaired_primary.contains("\"completed\": true"));
    }

    #[test]
    fn full_settings_read_recovers_from_last_known_good_backup() {
        let dir = temp_config_dir("full-backup-recovery");
        let store = LocalSettingsStore::new(&dir);
        let preferences = AppShellPreferences {
            sidebar_collapsed: true,
            voice_capsule_enabled: true,
            voice_capsule_placement: Some(VoiceCapsulePlacement {
                anchor: VoiceCapsuleAnchor::TopCenter,
                offset_x: Some(8.0),
                offset_y: Some(16.0),
                monitor: None,
            }),
        };

        store
            .save_app_shell_preferences(preferences.clone())
            .unwrap();
        fs::write(dir.join(SETTINGS_FILE_NAME), "{").unwrap();

        let recovered = LocalSettingsStore::new(&dir)
            .app_shell_preferences()
            .unwrap();

        assert_eq!(recovered, preferences);
        let repaired_primary = fs::read_to_string(dir.join(SETTINGS_FILE_NAME)).unwrap();
        serde_json::from_str::<serde_json::Value>(&repaired_primary).unwrap();
    }

    #[test]
    fn valid_primary_refreshes_corrupted_last_known_good_backup() {
        let dir = temp_config_dir("refresh-corrupt-backup");
        let store = LocalSettingsStore::new(&dir);
        store.complete_onboarding().unwrap();
        fs::write(dir.join(SETTINGS_BACKUP_FILE_NAME), "{").unwrap();

        assert!(
            LocalSettingsStore::new(&dir)
                .onboarding_state()
                .unwrap()
                .completed
        );

        let backup = fs::read_to_string(dir.join(SETTINGS_BACKUP_FILE_NAME)).unwrap();
        serde_json::from_str::<serde_json::Value>(&backup).unwrap();
        assert!(backup.contains("\"completed\": true"));
    }

    fn assert_no_provider_secrets(json: &str, secret_values: &[&str]) {
        let secret_field_markers = [
            "apiKey",
            "api_key",
            "apikey",
            "secret",
            "password",
            "token",
            "providerKey",
            "provider_key",
        ];

        for marker in secret_field_markers {
            assert!(
                !json
                    .to_ascii_lowercase()
                    .contains(&marker.to_ascii_lowercase()),
                "settings.json must not contain secret-like field marker `{marker}`"
            );
        }

        for secret_value in secret_values {
            assert!(
                !json.contains(secret_value),
                "settings.json must not contain provider secret value `{secret_value}`"
            );
        }
    }
}
