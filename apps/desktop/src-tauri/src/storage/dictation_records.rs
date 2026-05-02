#![allow(dead_code)]

use crate::platform::common::FocusedFieldInfo;
use crate::providers::errors::{ProviderError, ProviderFailure};
use crate::storage::LocalSettingsStore;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use uuid::Uuid;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalIdentity {
    pub user_id: String,
    pub installation_id: String,
    pub device_id: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationRecordV1 {
    pub schema_version: u32,
    pub record_id: String,
    pub user_id: String,
    pub installation_id: String,
    pub device_id: String,
    pub session_id: String,
    pub mode: String,
    pub trigger: String,
    pub platform: String,
    pub captured_at: String,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
    #[serde(default)]
    pub recording: Option<DictationRecordingDiagnostics>,
    #[serde(default)]
    pub audio: Option<DictationAudioArtifact>,
    pub target: DictationTargetSnapshot,
    pub provider: Option<DictationProviderContext>,
    pub transcript: DictationTranscript,
    pub insertion: DictationInsertionOutcome,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationRecordDraftV1 {
    pub session_id: Option<String>,
    pub mode: String,
    pub trigger: String,
    pub captured_at: String,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
    #[serde(default)]
    pub recording: Option<DictationRecordingDiagnostics>,
    #[serde(default)]
    pub audio: Option<DictationAudioArtifact>,
    pub target: DictationTargetSnapshot,
    pub provider: Option<DictationProviderContext>,
    pub transcript: DictationTranscript,
    pub insertion: DictationInsertionOutcome,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationRecordingDiagnostics {
    pub startup_ms: usize,
    pub stream_acquisition_ms: usize,
    pub reused_warm_stream: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationAudioArtifact {
    pub relative_path: String,
    pub mime_type: String,
    pub byte_length: usize,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedDictationAudio {
    pub audio_bytes: Vec<u8>,
    pub mime_type: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationTargetSnapshot {
    pub stable_id: String,
    pub window_title: String,
    pub control_name: String,
    pub control_type: String,
    pub control_type_id: i32,
    pub automation_id: String,
    pub framework_id: String,
    pub class_name: String,
    pub native_window_handle: i64,
    pub input_kind: String,
    pub current_value: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationProviderContext {
    pub provider_id: String,
    pub model_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationTranscript {
    pub raw_text: String,
    pub final_text: String,
    pub character_count: usize,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationInsertionOutcome {
    pub status: String,
    pub method: Option<String>,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug)]
pub struct LocalDictationRecordStore {
    records_path: PathBuf,
    lock: Mutex<()>,
}

impl LocalDictationRecordStore {
    pub fn new(config_dir: impl AsRef<Path>) -> Self {
        Self {
            records_path: config_dir.as_ref().join("dictation-records.jsonl"),
            lock: Mutex::new(()),
        }
    }

    pub fn save(
        &self,
        settings: &LocalSettingsStore,
        draft: DictationRecordDraftV1,
    ) -> Result<DictationRecordV1, ProviderError> {
        let _guard = self
            .lock
            .lock()
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        let identity = settings.local_identity()?;
        let record = DictationRecordV1 {
            schema_version: 1,
            record_id: Uuid::new_v4().to_string(),
            user_id: identity.user_id,
            installation_id: identity.installation_id,
            device_id: identity.device_id,
            session_id: draft
                .session_id
                .unwrap_or_else(|| Uuid::new_v4().to_string()),
            mode: draft.mode,
            trigger: draft.trigger,
            platform: std::env::consts::OS.to_string(),
            captured_at: draft.captured_at,
            started_at: draft.started_at,
            ended_at: draft.ended_at,
            recording: draft.recording,
            audio: draft.audio,
            target: draft.target,
            provider: draft.provider,
            transcript: draft.transcript,
            insertion: draft.insertion,
        };

        self.append_record(&record)?;
        Ok(record)
    }

    pub fn list_recent(&self, limit: usize) -> Result<Vec<DictationRecordV1>, ProviderError> {
        let _guard = self
            .lock
            .lock()
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        self.load_recent_records(limit)
    }

    pub fn persist_audio(
        &self,
        audio_bytes: Vec<u8>,
        mime_type: String,
        captured_at: &str,
    ) -> Result<DictationAudioArtifact, ProviderError> {
        let _guard = self
            .lock
            .lock()
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        let relative_path = build_audio_relative_path(captured_at, &mime_type);
        let full_path = self.resolve_audio_path(&relative_path)?;

        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        }

        fs::write(&full_path, &audio_bytes)
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;

        Ok(DictationAudioArtifact {
            relative_path,
            mime_type,
            byte_length: audio_bytes.len(),
        })
    }

    pub fn load_audio(&self, relative_path: &str) -> Result<SavedDictationAudio, ProviderError> {
        let _guard = self
            .lock
            .lock()
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        let full_path = self.resolve_audio_path(relative_path)?;
        let audio_bytes = fs::read(&full_path)
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;

        Ok(SavedDictationAudio {
            audio_bytes,
            mime_type: mime_type_for_extension(
                full_path
                    .extension()
                    .and_then(|extension| extension.to_str())
                    .unwrap_or_default(),
            ),
        })
    }

    fn append_record(&self, record: &DictationRecordV1) -> Result<(), ProviderError> {
        if let Some(parent) = self.records_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        }

        let raw = serde_json::to_string(record)
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.records_path)
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        writeln!(file, "{raw}").map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        Ok(())
    }

    fn load_recent_records(&self, limit: usize) -> Result<Vec<DictationRecordV1>, ProviderError> {
        if limit == 0 || !self.records_path.exists() {
            return Ok(Vec::new());
        }

        let raw = fs::read_to_string(&self.records_path)
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        raw.lines()
            .rev()
            .filter(|line| !line.trim().is_empty())
            .take(limit)
            .map(|line| {
                serde_json::from_str::<DictationRecordV1>(line)
                    .map_err(|err| ProviderFailure::SettingsStore(err.to_string()).into())
            })
            .collect()
    }

    fn resolve_audio_path(&self, relative_path: &str) -> Result<PathBuf, ProviderError> {
        let path = Path::new(relative_path);
        if !is_safe_relative_audio_path(path) {
            return Err(ProviderFailure::InvalidRequest("invalid audio path".to_string()).into());
        }

        let config_dir = self
            .records_path
            .parent()
            .ok_or_else(|| ProviderFailure::SettingsStore("missing config directory".to_string()))?;
        Ok(config_dir.join(path))
    }
}

impl DictationTargetSnapshot {
    #[must_use]
    pub fn from_focused_field(field: &FocusedFieldInfo, input_kind: impl Into<String>) -> Self {
        let input_kind = input_kind.into();
        Self {
            stable_id: field.stable_id.clone(),
            window_title: field.window_title.clone(),
            control_name: sanitize_target_control_name(
                &field.control_name,
                &field.control_type,
                &input_kind,
                &field.framework_id,
                &field.class_name,
            ),
            control_type: field.control_type.clone(),
            control_type_id: field.control_type_id,
            automation_id: field.automation_id.clone(),
            framework_id: field.framework_id.clone(),
            class_name: field.class_name.clone(),
            native_window_handle: field.native_window_handle,
            input_kind,
            current_value: None,
        }
    }
}

fn sanitize_target_control_name(
    control_name: &str,
    control_type: &str,
    input_kind: &str,
    framework_id: &str,
    class_name: &str,
) -> String {
    let trimmed = control_name.trim();
    if trimmed.is_empty() || looks_like_accessibility_placeholder(trimmed) {
        return fallback_target_label(control_type, input_kind, framework_id, class_name);
    }

    trimmed.to_string()
}

fn looks_like_accessibility_placeholder(value: &str) -> bool {
    let normalized = value.to_ascii_lowercase();
    let fragments = [
        "not accessible at this time",
        "screen reader optimized mode",
        "shift+alt+f1",
        "terminal accessibility help",
        "toggle screen reader accessibility mode",
        "use alt+f1",
    ];

    fragments
        .iter()
        .filter(|fragment| normalized.contains(**fragment))
        .count()
        >= 2
}

fn fallback_target_label(
    control_type: &str,
    input_kind: &str,
    framework_id: &str,
    class_name: &str,
) -> String {
    if input_kind == "editor" || control_type == "Document" {
        return "Editor".to_string();
    }

    if input_kind == "terminal" {
        return "Command input".to_string();
    }

    if input_kind == "browser" {
        return "Browser input".to_string();
    }

    if input_kind == "text" || control_type == "Edit" {
        return "Text input".to_string();
    }

    let combined_hints = format!("{framework_id} {class_name}").to_ascii_lowercase();
    if combined_hints.contains("termcontrol")
        || combined_hints.contains("terminal")
        || combined_hints.contains("cascadia")
    {
        return "Command input".to_string();
    }

    let trimmed = control_type.trim();
    if trimmed.is_empty() {
        "Focused field".to_string()
    } else {
        trimmed.to_string()
    }
}

fn build_audio_relative_path(captured_at: &str, mime_type: &str) -> String {
    let date_path = captured_at
        .split('T')
        .next()
        .map(|date| date.replace('-', "/"))
        .filter(|date| date.len() == 10)
        .unwrap_or_else(|| "unknown/date".to_string());
    let extension = extension_for_mime_type(mime_type);
    format!("recordings/{date_path}/{}.{}", Uuid::new_v4(), extension)
}

fn extension_for_mime_type(mime_type: &str) -> &'static str {
    match mime_type {
        "audio/wav" | "audio/x-wav" => "wav",
        "audio/mpeg" | "audio/mp3" => "mp3",
        "audio/ogg" => "ogg",
        "audio/flac" => "flac",
        "audio/mp4" | "audio/aac" => "m4a",
        "audio/webm" => "webm",
        _ => "webm",
    }
}

fn mime_type_for_extension(extension: &str) -> String {
    match extension {
        "wav" => "audio/wav",
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        "flac" => "audio/flac",
        "m4a" => "audio/mp4",
        "webm" => "audio/webm",
        _ => "application/octet-stream",
    }
    .to_string()
}

fn is_safe_relative_audio_path(path: &Path) -> bool {
    let mut components = path.components();
    let Some(Component::Normal(root)) = components.next() else {
        return false;
    };

    if root != "recordings" {
        return false;
    }

    components.all(|component| matches!(component, Component::Normal(_)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn serializes_canonical_dictation_record_shape() {
        let record = DictationRecordV1 {
            schema_version: 1,
            record_id: "a86f0b9f-0f5a-48e8-a24f-2851cb4be4df".to_string(),
            user_id: "3fd61656-c0e8-4b3c-b37f-18d85ed43499".to_string(),
            installation_id: "9d4f4d32-236d-4f12-b88e-b01eb0fdfca3".to_string(),
            device_id: "560fcc96-03a4-41da-8d2a-95f5db67e6c7".to_string(),
            session_id: "0938f4c2-8f2f-4490-a91e-d408f810090e".to_string(),
            mode: "dictation".to_string(),
            trigger: "hotkey".to_string(),
            platform: "windows".to_string(),
            captured_at: "2026-05-02T08:30:00Z".to_string(),
            started_at: Some("2026-05-02T08:30:01Z".to_string()),
            ended_at: Some("2026-05-02T08:30:04Z".to_string()),
            recording: Some(DictationRecordingDiagnostics {
                startup_ms: 42,
                stream_acquisition_ms: 18,
                reused_warm_stream: false,
            }),
            audio: Some(DictationAudioArtifact {
                relative_path: "recordings/2026/05/02/a86f0b9f.webm".to_string(),
                mime_type: "audio/webm".to_string(),
                byte_length: 2048,
            }),
            target: DictationTargetSnapshot {
                stable_id: "window:42/control:message-input".to_string(),
                window_title: "Discord".to_string(),
                control_name: "Message".to_string(),
                control_type: "Edit".to_string(),
                control_type_id: 50004,
                automation_id: "message-input".to_string(),
                framework_id: "Win32".to_string(),
                class_name: "Chrome_WidgetWin_1".to_string(),
                native_window_handle: 42,
                input_kind: "text".to_string(),
                current_value: None,
            },
            provider: Some(DictationProviderContext {
                provider_id: "openai".to_string(),
                model_id: Some("gpt-4o-mini-transcribe".to_string()),
            }),
            transcript: DictationTranscript {
                raw_text: "hello team".to_string(),
                final_text: "hello team".to_string(),
                character_count: 10,
            },
            insertion: DictationInsertionOutcome {
                status: "inserted".to_string(),
                method: Some("clipboard_paste".to_string()),
                error_code: None,
                error_message: None,
            },
        };

        let actual = serde_json::to_value(record).unwrap();

        assert_eq!(
            actual,
            json!({
                "schemaVersion": 1,
                "recordId": "a86f0b9f-0f5a-48e8-a24f-2851cb4be4df",
                "userId": "3fd61656-c0e8-4b3c-b37f-18d85ed43499",
                "installationId": "9d4f4d32-236d-4f12-b88e-b01eb0fdfca3",
                "deviceId": "560fcc96-03a4-41da-8d2a-95f5db67e6c7",
                "sessionId": "0938f4c2-8f2f-4490-a91e-d408f810090e",
                "mode": "dictation",
                "trigger": "hotkey",
                "platform": "windows",
                "capturedAt": "2026-05-02T08:30:00Z",
                "startedAt": "2026-05-02T08:30:01Z",
                "endedAt": "2026-05-02T08:30:04Z",
                "recording": {
                    "startupMs": 42,
                    "streamAcquisitionMs": 18,
                    "reusedWarmStream": false
                },
                "audio": {
                    "relativePath": "recordings/2026/05/02/a86f0b9f.webm",
                    "mimeType": "audio/webm",
                    "byteLength": 2048
                },
                "target": {
                    "stableId": "window:42/control:message-input",
                    "windowTitle": "Discord",
                    "controlName": "Message",
                    "controlType": "Edit",
                    "controlTypeId": 50004,
                    "automationId": "message-input",
                    "frameworkId": "Win32",
                    "className": "Chrome_WidgetWin_1",
                    "nativeWindowHandle": 42,
                    "inputKind": "text",
                    "currentValue": null
                },
                "provider": {
                    "providerId": "openai",
                    "modelId": "gpt-4o-mini-transcribe"
                },
                "transcript": {
                    "rawText": "hello team",
                    "finalText": "hello team",
                    "characterCount": 10
                },
                "insertion": {
                    "status": "inserted",
                    "method": "clipboard_paste",
                    "errorCode": null,
                    "errorMessage": null
                }
            })
        );
    }

    #[test]
    fn converts_focused_field_into_target_snapshot() {
        let field = FocusedFieldInfo {
            window_title: "Code".to_string(),
            control_name: "Editor".to_string(),
            control_type: "Document".to_string(),
            control_type_id: 50030,
            automation_id: "editor".to_string(),
            framework_id: "Chrome".to_string(),
            class_name: "Chrome_WidgetWin_1".to_string(),
            current_value: String::new(),
            native_window_handle: 84,
            stable_id: "window:84/control:editor".to_string(),
        };

        let actual = DictationTargetSnapshot::from_focused_field(&field, "editor");

        assert_eq!(
            actual,
            DictationTargetSnapshot {
                stable_id: "window:84/control:editor".to_string(),
                window_title: "Code".to_string(),
                control_name: "Editor".to_string(),
                control_type: "Document".to_string(),
                control_type_id: 50030,
                automation_id: "editor".to_string(),
                framework_id: "Chrome".to_string(),
                class_name: "Chrome_WidgetWin_1".to_string(),
                native_window_handle: 84,
                input_kind: "editor".to_string(),
                current_value: None,
            }
        );
    }

    #[test]
    fn replaces_editor_accessibility_placeholder_with_editor_label() {
        let field = FocusedFieldInfo {
            window_title: "Visual Studio Code".to_string(),
            control_name: "The editor is not accessible at this time. To enable screen reader optimized mode, use Shift+Alt+F1".to_string(),
            control_type: "Document".to_string(),
            control_type_id: 50030,
            automation_id: "editor".to_string(),
            framework_id: "Chrome".to_string(),
            class_name: "Chrome_RenderWidgetHostHWND".to_string(),
            current_value: String::new(),
            native_window_handle: 84,
            stable_id: "window:84/control:editor".to_string(),
        };

        let actual = DictationTargetSnapshot::from_focused_field(&field, "editor");

        assert_eq!(actual.control_name, "Editor");
    }

    #[test]
    fn finalizes_and_appends_record_with_local_identity() {
        let dir = temp_config_dir("dictation-record-store");
        let settings = crate::storage::LocalSettingsStore::new(&dir);
        let store = LocalDictationRecordStore::new(&dir);
        let draft = DictationRecordDraftV1 {
            session_id: Some("0938f4c2-8f2f-4490-a91e-d408f810090e".to_string()),
            mode: "dictation".to_string(),
            trigger: "hotkey".to_string(),
            captured_at: "2026-05-02T08:30:00Z".to_string(),
            started_at: Some("2026-05-02T08:30:01Z".to_string()),
            ended_at: Some("2026-05-02T08:30:04Z".to_string()),
            recording: Some(DictationRecordingDiagnostics {
                startup_ms: 42,
                stream_acquisition_ms: 18,
                reused_warm_stream: false,
            }),
            audio: Some(DictationAudioArtifact {
                relative_path: "recordings/2026/05/02/a86f0b9f.webm".to_string(),
                mime_type: "audio/webm".to_string(),
                byte_length: 2048,
            }),
            target: DictationTargetSnapshot {
                stable_id: "window:42/control:message-input".to_string(),
                window_title: "Discord".to_string(),
                control_name: "Message".to_string(),
                control_type: "Edit".to_string(),
                control_type_id: 50004,
                automation_id: "message-input".to_string(),
                framework_id: "Win32".to_string(),
                class_name: "Chrome_WidgetWin_1".to_string(),
                native_window_handle: 42,
                input_kind: "text".to_string(),
                current_value: None,
            },
            provider: Some(DictationProviderContext {
                provider_id: "openai".to_string(),
                model_id: Some("gpt-4o-mini-transcribe".to_string()),
            }),
            transcript: DictationTranscript {
                raw_text: "hello team".to_string(),
                final_text: "hello team".to_string(),
                character_count: 10,
            },
            insertion: DictationInsertionOutcome {
                status: "inserted".to_string(),
                method: Some("clipboard_paste".to_string()),
                error_code: None,
                error_message: None,
            },
        };

        let saved = store.save(&settings, draft).unwrap();
        let expected_identity = settings.local_identity().unwrap();

        assert_eq!(saved.schema_version, 1);
        assert_eq!(saved.user_id, expected_identity.user_id);
        assert_eq!(saved.installation_id, expected_identity.installation_id);
        assert_eq!(saved.device_id, expected_identity.device_id);
        assert_eq!(saved.platform, std::env::consts::OS);

        let raw = fs::read_to_string(dir.join("dictation-records.jsonl")).unwrap();
        let lines: Vec<&str> = raw.lines().collect();
        assert_eq!(lines.len(), 1);

        let persisted: DictationRecordV1 = serde_json::from_str(lines[0]).unwrap();
        assert_eq!(persisted, saved);
    }

    #[test]
    fn loads_recent_records_in_reverse_chronological_order() {
        let dir = temp_config_dir("dictation-record-history");
        let settings = crate::storage::LocalSettingsStore::new(&dir);
        let store = LocalDictationRecordStore::new(&dir);

        for minute in 0..3 {
            store
                .save(
                    &settings,
                    DictationRecordDraftV1 {
                        session_id: Some(format!("session-{minute}")),
                        mode: "dictation".to_string(),
                        trigger: "hotkey".to_string(),
                        captured_at: format!("2026-05-02T08:3{minute}:00Z"),
                        started_at: None,
                        ended_at: None,
                        recording: None,
                        audio: None,
                        target: DictationTargetSnapshot {
                            stable_id: format!("target-{minute}"),
                            window_title: "Discord".to_string(),
                            control_name: "Message".to_string(),
                            control_type: "Edit".to_string(),
                            control_type_id: 50004,
                            automation_id: "message-input".to_string(),
                            framework_id: "Win32".to_string(),
                            class_name: "Chrome_WidgetWin_1".to_string(),
                            native_window_handle: 42,
                            input_kind: "text".to_string(),
                            current_value: None,
                        },
                        provider: None,
                        transcript: DictationTranscript {
                            raw_text: format!("raw-{minute}"),
                            final_text: format!("final-{minute}"),
                            character_count: 7,
                        },
                        insertion: DictationInsertionOutcome {
                            status: "inserted".to_string(),
                            method: Some("send_input".to_string()),
                            error_code: None,
                            error_message: None,
                        },
                    },
                )
                .unwrap();
        }

        let recent = store.list_recent(2).unwrap();

        assert_eq!(recent.len(), 2);
        assert_eq!(recent[0].session_id, "session-2");
        assert_eq!(recent[1].session_id, "session-1");
    }

    #[test]
    fn persists_and_loads_recording_audio_with_scoped_relative_paths() {
        let dir = temp_config_dir("dictation-record-audio");
        let store = LocalDictationRecordStore::new(&dir);

        let saved = store
            .persist_audio(
                vec![1, 2, 3],
                "audio/webm".to_string(),
                "2026-05-02T08:30:00Z",
            )
            .unwrap();

        assert!(saved.relative_path.starts_with("recordings/2026/05/02/"));
        assert_eq!(saved.mime_type, "audio/webm");
        assert_eq!(saved.byte_length, 3);

        let loaded = store.load_audio(&saved.relative_path).unwrap();
        assert_eq!(loaded.audio_bytes, vec![1, 2, 3]);
        assert_eq!(loaded.mime_type, "audio/webm");
    }

    #[test]
    fn rejects_audio_paths_outside_recordings_scope() {
        let dir = temp_config_dir("dictation-record-audio-path");
        let store = LocalDictationRecordStore::new(&dir);

        let err = store.load_audio("../outside.webm").unwrap_err();

        assert_eq!(err.code, "invalid_request");
    }

    fn temp_config_dir(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "vaak-dictation-records-test-{name}-{}-{suffix}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn loads_legacy_records_without_recording_metrics() {
        let dir = temp_config_dir("dictation-record-legacy");
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("dictation-records.jsonl"),
            r#"{"schemaVersion":1,"recordId":"a86f0b9f-0f5a-48e8-a24f-2851cb4be4df","userId":"3fd61656-c0e8-4b3c-b37f-18d85ed43499","installationId":"9d4f4d32-236d-4f12-b88e-b01eb0fdfca3","deviceId":"560fcc96-03a4-41da-8d2a-95f5db67e6c7","sessionId":"0938f4c2-8f2f-4490-a91e-d408f810090e","mode":"dictation","trigger":"hotkey","platform":"windows","capturedAt":"2026-05-02T08:30:00Z","startedAt":"2026-05-02T08:30:01Z","endedAt":"2026-05-02T08:30:04Z","target":{"stableId":"window:42/control:message-input","windowTitle":"Discord","controlName":"Message","controlType":"Edit","controlTypeId":50004,"automationId":"message-input","frameworkId":"Win32","className":"Chrome_WidgetWin_1","nativeWindowHandle":42,"inputKind":"text","currentValue":null},"provider":null,"transcript":{"rawText":"hello","finalText":"hello","characterCount":5},"insertion":{"status":"inserted","method":"send_input","errorCode":null,"errorMessage":null}}"#,
        )
        .unwrap();

        let records = LocalDictationRecordStore::new(&dir).list_recent(1).unwrap();

        assert_eq!(records.len(), 1);
        assert_eq!(records[0].recording, None);
    }
}
