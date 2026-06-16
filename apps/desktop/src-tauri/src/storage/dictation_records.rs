#![allow(dead_code)]

use crate::platform::common::FocusedFieldInfo;
use crate::providers::errors::{ProviderError, ProviderFailure};
use crate::storage::LocalSettingsStore;
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use uuid::Uuid;

const LOCAL_SQLITE_SCHEMA_VERSION: u32 = 2;
const RECENT_RECORD_LIMIT_MAX: usize = 100;

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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub processed_audio: Option<DictationAudioArtifact>,
    pub target: DictationTargetSnapshot,
    pub provider: Option<DictationProviderContext>,
    pub transcript: DictationTranscript,
    pub insertion: DictationInsertionOutcome,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timeline: Option<DictationTimeline>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub processed_audio: Option<DictationAudioArtifact>,
    pub target: DictationTargetSnapshot,
    pub provider: Option<DictationProviderContext>,
    pub transcript: DictationTranscript,
    pub insertion: DictationInsertionOutcome,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timeline: Option<DictationTimeline>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationRecordUpdateV1 {
    #[serde(default)]
    pub recording: Option<DictationRecordingDiagnostics>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub processed_audio: Option<DictationAudioArtifact>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub analysis_ms: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transcription_ms: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub insertion_ms: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub post_processing_ms: Option<usize>,
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
pub struct ExportedDictationAudio {
    pub saved_path: String,
    pub file_name: String,
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

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationTimeline {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recording_started_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recording_stopped_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub processing_started_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub audio_analysis_completed_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transcription_started_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_request_started_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_response_received_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transcription_completed_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub insertion_started_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub insertion_completed_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub record_persisted_at: Option<String>,
    #[serde(default)]
    pub provider_requests: Vec<DictationProviderRequestTiming>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub provider_events: Vec<DictationProviderTimelineEvent>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationProviderRequestTiming {
    pub segment_index: usize,
    pub started_at: String,
    pub completed_at: String,
    pub provider_id: String,
    pub model_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationProviderTimelineEvent {
    pub event_type: String,
    pub provider_id: String,
    #[serde(default)]
    pub model_id: Option<String>,
    pub provider_mode: String,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub stage: Option<String>,
    #[serde(default)]
    pub started_at: Option<String>,
    #[serde(default)]
    pub completed_at: Option<String>,
    #[serde(default)]
    pub duration_ms: Option<i64>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub error_code: Option<String>,
    #[serde(default)]
    pub bytes_sent: Option<i64>,
    #[serde(default)]
    pub frame_count: Option<i64>,
    #[serde(default)]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug)]
pub struct LocalDictationRecordStore {
    db_path: PathBuf,
    lock: Mutex<()>,
}

impl LocalDictationRecordStore {
    pub fn new(config_dir: impl AsRef<Path>) -> Self {
        Self {
            db_path: config_dir.as_ref().join("dictation-records.sqlite"),
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
        validate_audio_artifact_paths(&draft)?;
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
            processed_audio: draft.processed_audio,
            target: draft.target,
            provider: draft.provider,
            transcript: draft.transcript,
            insertion: draft.insertion,
            timeline: draft.timeline,
        };

        let mut conn = self.open_connection()?;
        self.insert_record(&mut conn, &record)?;
        Ok(record)
    }

    pub fn list_recent(
        &self,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<DictationRecordV1>, ProviderError> {
        let _guard = self
            .lock
            .lock()
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        self.load_recent_records(limit, offset)
    }

    pub fn update(
        &self,
        record_id: &str,
        patch: DictationRecordUpdateV1,
    ) -> Result<DictationRecordV1, ProviderError> {
        let _guard = self
            .lock
            .lock()
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        validate_update_audio_artifact_paths(&patch)?;

        if !self.db_path.exists() {
            return Err(
                ProviderFailure::InvalidRequest("dictation record not found".to_string()).into(),
            );
        }

        let mut conn = self.open_connection()?;
        let payload_json: Option<String> = conn
            .query_row(
                "SELECT payload_json FROM dictation_records WHERE record_id = ?1",
                params![record_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(sqlite_error)?;

        let Some(payload_json) = payload_json else {
            return Err(
                ProviderFailure::InvalidRequest("dictation record not found".to_string()).into(),
            );
        };

        let mut updated_record: DictationRecordV1 =
            serde_json::from_str(&payload_json).map_err(storage_error)?;
        updated_record.recording = patch.recording;
        updated_record.processed_audio = patch.processed_audio;
        updated_record.provider = patch.provider;
        updated_record.transcript = patch.transcript;
        updated_record.insertion = patch.insertion;

        self.update_record(&mut conn, &updated_record)?;

        Ok(updated_record)
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
        let audio_bytes =
            fs::read(&full_path).map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;

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

    pub fn export_audio_to_dir(
        &self,
        relative_path: &str,
        export_dir: impl AsRef<Path>,
    ) -> Result<ExportedDictationAudio, ProviderError> {
        let _guard = self
            .lock
            .lock()
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;
        let source_path = self.resolve_audio_path(relative_path)?;
        let source_bytes = fs::read(&source_path)
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;

        let export_dir = export_dir.as_ref().join("Vaak");
        fs::create_dir_all(&export_dir)
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;

        let source_file_name = source_path
            .file_name()
            .and_then(|file_name| file_name.to_str())
            .filter(|file_name| !file_name.trim().is_empty())
            .unwrap_or("vaak-recording.webm");
        let export_path = next_available_export_path(&export_dir, source_file_name);

        fs::write(&export_path, source_bytes)
            .map_err(|err| ProviderFailure::SettingsStore(err.to_string()))?;

        let file_name = export_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or(source_file_name)
            .to_string();

        Ok(ExportedDictationAudio {
            saved_path: export_path.to_string_lossy().to_string(),
            file_name,
        })
    }

    fn resolve_audio_path(&self, relative_path: &str) -> Result<PathBuf, ProviderError> {
        let path = Path::new(relative_path);
        if !is_safe_relative_audio_path(path) {
            return Err(ProviderFailure::InvalidRequest("invalid audio path".to_string()).into());
        }

        let config_dir = self.db_path.parent().ok_or_else(|| {
            ProviderFailure::SettingsStore("missing config directory".to_string())
        })?;
        Ok(config_dir.join(path))
    }

    fn open_connection(&self) -> Result<Connection, ProviderError> {
        if let Some(parent) = self.db_path.parent() {
            fs::create_dir_all(parent).map_err(storage_error)?;
        }

        let mut conn = Connection::open(&self.db_path).map_err(sqlite_error)?;
        conn.busy_timeout(Duration::from_millis(5000))
            .map_err(sqlite_error)?;
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(sqlite_error)?;
        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(sqlite_error)?;
        self.ensure_schema(&mut conn)?;
        self.import_legacy_jsonl_records(&mut conn)?;
        Ok(conn)
    }

    fn ensure_schema(&self, conn: &mut Connection) -> Result<(), ProviderError> {
        let user_version: u32 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(sqlite_error)?;

        if user_version > LOCAL_SQLITE_SCHEMA_VERSION {
            return Err(ProviderFailure::SettingsStore(format!(
                "dictation records database schema version {user_version} is newer than supported version {LOCAL_SQLITE_SCHEMA_VERSION}"
            ))
            .into());
        }

        if user_version == LOCAL_SQLITE_SCHEMA_VERSION {
            return Ok(());
        }

        let tx = conn.transaction().map_err(sqlite_error)?;
        tx.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS schema_migrations (
              version INTEGER PRIMARY KEY,
              applied_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS dictation_records (
              record_id TEXT PRIMARY KEY,
              schema_version INTEGER NOT NULL,
              session_id TEXT NOT NULL,
              user_id TEXT NOT NULL,
              installation_id TEXT NOT NULL,
              device_id TEXT NOT NULL,
              captured_at TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              mode TEXT NOT NULL,
              trigger TEXT NOT NULL,
              platform TEXT NOT NULL,
              status TEXT NOT NULL,
              provider_id TEXT,
              raw_text TEXT NOT NULL DEFAULT '',
              final_text TEXT NOT NULL DEFAULT '',
              target_window_title TEXT NOT NULL DEFAULT '',
              target_control_name TEXT NOT NULL DEFAULT '',
              audio_relative_path TEXT,
              processed_audio_relative_path TEXT,
              recording_started_at TEXT,
              recording_stopped_at TEXT,
              processing_started_at TEXT,
              audio_analysis_completed_at TEXT,
              transcription_started_at TEXT,
              provider_request_started_at TEXT,
              provider_response_received_at TEXT,
              transcription_completed_at TEXT,
              insertion_started_at TEXT,
              insertion_completed_at TEXT,
              record_persisted_at TEXT,
              recording_duration_ms INTEGER,
              audio_analysis_duration_ms INTEGER,
              processing_duration_ms INTEGER,
              transcription_duration_ms INTEGER,
              provider_roundtrip_ms INTEGER,
              provider_total_roundtrip_ms INTEGER,
              provider_max_roundtrip_ms INTEGER,
              insertion_duration_ms INTEGER,
              provider_request_count INTEGER,
              audio_byte_length INTEGER,
              provider_model_id TEXT,
              error_code TEXT,
              payload_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS dictation_provider_requests (
              provider_request_id INTEGER PRIMARY KEY AUTOINCREMENT,
              record_id TEXT NOT NULL,
              segment_index INTEGER NOT NULL,
              attempt_index INTEGER NOT NULL,
              provider_id TEXT NOT NULL,
              model_id TEXT,
              started_at TEXT NOT NULL,
              completed_at TEXT NOT NULL,
              duration_ms INTEGER,
              status TEXT NOT NULL,
              error_code TEXT,
              FOREIGN KEY(record_id) REFERENCES dictation_records(record_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS dictation_provider_events (
              event_id TEXT PRIMARY KEY,
              record_id TEXT NOT NULL,
              provider_request_id INTEGER,
              provider_id TEXT NOT NULL,
              model_id TEXT,
              provider_mode TEXT NOT NULL,
              session_id TEXT,
              event_type TEXT NOT NULL,
              stage TEXT,
              started_at TEXT,
              completed_at TEXT,
              duration_ms INTEGER,
              status TEXT,
              error_code TEXT,
              bytes_sent INTEGER,
              frame_count INTEGER,
              metadata_json TEXT,
              created_at TEXT NOT NULL,
              FOREIGN KEY(record_id) REFERENCES dictation_records(record_id) ON DELETE CASCADE,
              FOREIGN KEY(provider_request_id) REFERENCES dictation_provider_requests(provider_request_id) ON DELETE SET NULL
            );

            CREATE INDEX IF NOT EXISTS idx_dictation_records_captured_at
              ON dictation_records(captured_at DESC);

            CREATE INDEX IF NOT EXISTS idx_dictation_records_session_id
              ON dictation_records(session_id);

            CREATE INDEX IF NOT EXISTS idx_dictation_records_status
              ON dictation_records(status, captured_at DESC);

            "#,
        )
        .map_err(sqlite_error)?;
        add_timeline_columns_if_missing(&tx)?;
        create_analytics_indexes(&tx)?;
        backfill_timeline_columns(&tx)?;

        tx.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?1, ?2)",
            params![LOCAL_SQLITE_SCHEMA_VERSION, current_utc_timestamp()],
        )
        .map_err(sqlite_error)?;
        tx.pragma_update(None, "user_version", LOCAL_SQLITE_SCHEMA_VERSION)
            .map_err(sqlite_error)?;
        tx.commit().map_err(sqlite_error)?;
        Ok(())
    }

    fn insert_record(
        &self,
        conn: &mut Connection,
        record: &DictationRecordV1,
    ) -> Result<(), ProviderError> {
        let now = current_utc_timestamp();
        let tx = conn.transaction().map_err(sqlite_error)?;
        insert_record_with_transaction(&tx, record, &now)?;
        tx.commit().map_err(sqlite_error)?;
        Ok(())
    }

    fn update_record(
        &self,
        conn: &mut Connection,
        record: &DictationRecordV1,
    ) -> Result<(), ProviderError> {
        let created_at: String = conn
            .query_row(
                "SELECT created_at FROM dictation_records WHERE record_id = ?1",
                params![record.record_id],
                |row| row.get(0),
            )
            .map_err(sqlite_error)?;
        let updated_at = current_utc_timestamp();
        let row = SqliteDictationRecordRow::from_record(record, &created_at, &updated_at)?;
        let tx = conn.transaction().map_err(sqlite_error)?;
        let updated = tx
            .execute(
                r#"
                UPDATE dictation_records
                SET schema_version = ?2,
                    session_id = ?3,
                    user_id = ?4,
                    installation_id = ?5,
                    device_id = ?6,
                    captured_at = ?7,
                    created_at = ?8,
                    updated_at = ?9,
                    mode = ?10,
                    trigger = ?11,
                    platform = ?12,
                    status = ?13,
                    provider_id = ?14,
                    raw_text = ?15,
                    final_text = ?16,
                    target_window_title = ?17,
                    target_control_name = ?18,
                    audio_relative_path = ?19,
                    processed_audio_relative_path = ?20,
                    recording_started_at = ?21,
                    recording_stopped_at = ?22,
                    processing_started_at = ?23,
                    audio_analysis_completed_at = ?24,
                    transcription_started_at = ?25,
                    provider_request_started_at = ?26,
                    provider_response_received_at = ?27,
                    transcription_completed_at = ?28,
                    insertion_started_at = ?29,
                    insertion_completed_at = ?30,
                    record_persisted_at = ?31,
                    recording_duration_ms = ?32,
                    audio_analysis_duration_ms = ?33,
                    processing_duration_ms = ?34,
                    transcription_duration_ms = ?35,
                    provider_roundtrip_ms = ?36,
                    provider_total_roundtrip_ms = ?37,
                    provider_max_roundtrip_ms = ?38,
                    insertion_duration_ms = ?39,
                    provider_request_count = ?40,
                    audio_byte_length = ?41,
                    provider_model_id = ?42,
                    error_code = ?43,
                    payload_json = ?44
                WHERE record_id = ?1
                "#,
                params![
                    row.record_id,
                    row.schema_version,
                    row.session_id,
                    row.user_id,
                    row.installation_id,
                    row.device_id,
                    row.captured_at,
                    row.created_at,
                    row.updated_at,
                    row.mode,
                    row.trigger,
                    row.platform,
                    row.status,
                    row.provider_id,
                    row.raw_text,
                    row.final_text,
                    row.target_window_title,
                    row.target_control_name,
                    row.audio_relative_path,
                    row.processed_audio_relative_path,
                    row.recording_started_at,
                    row.recording_stopped_at,
                    row.processing_started_at,
                    row.audio_analysis_completed_at,
                    row.transcription_started_at,
                    row.provider_request_started_at,
                    row.provider_response_received_at,
                    row.transcription_completed_at,
                    row.insertion_started_at,
                    row.insertion_completed_at,
                    row.record_persisted_at,
                    row.recording_duration_ms,
                    row.audio_analysis_duration_ms,
                    row.processing_duration_ms,
                    row.transcription_duration_ms,
                    row.provider_roundtrip_ms,
                    row.provider_total_roundtrip_ms,
                    row.provider_max_roundtrip_ms,
                    row.insertion_duration_ms,
                    row.provider_request_count,
                    row.audio_byte_length,
                    row.provider_model_id,
                    row.error_code,
                    row.payload_json,
                ],
            )
            .map_err(sqlite_error)?;

        if updated == 0 {
            return Err(
                ProviderFailure::InvalidRequest("dictation record not found".to_string()).into(),
            );
        }

        sync_provider_request_rows(&tx, record)?;
        sync_provider_event_rows(&tx, record)?;
        tx.commit().map_err(sqlite_error)?;
        Ok(())
    }

    fn load_recent_records(
        &self,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<DictationRecordV1>, ProviderError> {
        if limit == 0 {
            return Ok(Vec::new());
        }
        if !self.db_path.exists() && !self.legacy_jsonl_path().exists() {
            return Ok(Vec::new());
        }

        let conn = self.open_connection()?;
        let limit = limit.min(RECENT_RECORD_LIMIT_MAX);
        let mut statement = conn
            .prepare(
                r#"
                SELECT payload_json
                FROM dictation_records
                ORDER BY captured_at DESC, created_at DESC, record_id DESC
                LIMIT ?1 OFFSET ?2
                "#,
            )
            .map_err(sqlite_error)?;
        let rows = statement
            .query_map(params![limit as i64, offset as i64], |row| {
                row.get::<_, String>(0)
            })
            .map_err(sqlite_error)?;
        let mut records = Vec::new();

        for row in rows {
            let payload_json = row.map_err(sqlite_error)?;
            let record =
                serde_json::from_str::<DictationRecordV1>(&payload_json).map_err(storage_error)?;
            records.push(record);
        }

        Ok(records)
    }

    fn legacy_jsonl_path(&self) -> PathBuf {
        self.db_path
            .parent()
            .map(|parent| parent.join("dictation-records.jsonl"))
            .unwrap_or_else(|| PathBuf::from("dictation-records.jsonl"))
    }

    fn import_legacy_jsonl_records(&self, conn: &mut Connection) -> Result<(), ProviderError> {
        let legacy_path = self.legacy_jsonl_path();
        if !legacy_path.exists() {
            return Ok(());
        }

        let file = fs::File::open(&legacy_path).map_err(storage_error)?;
        let reader = BufReader::new(file);
        let tx = conn.transaction().map_err(sqlite_error)?;

        for line in reader.lines() {
            let line = line.map_err(storage_error)?;
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let record: DictationRecordV1 = serde_json::from_str(trimmed).map_err(storage_error)?;
            if legacy_record_exists(&tx, &record.record_id)? {
                continue;
            }

            insert_record_with_transaction(&tx, &record, &current_utc_timestamp())?;
        }

        tx.commit().map_err(sqlite_error)?;
        Ok(())
    }
}

fn insert_record_with_transaction(
    tx: &Transaction<'_>,
    record: &DictationRecordV1,
    timestamp: &str,
) -> Result<(), ProviderError> {
    let row = SqliteDictationRecordRow::from_record(record, timestamp, timestamp)?;
    tx.execute(
        r#"
        INSERT INTO dictation_records (
          record_id,
          schema_version,
          session_id,
          user_id,
          installation_id,
          device_id,
          captured_at,
          created_at,
          updated_at,
          mode,
          trigger,
          platform,
          status,
          provider_id,
          raw_text,
          final_text,
          target_window_title,
          target_control_name,
          audio_relative_path,
          processed_audio_relative_path,
          recording_started_at,
          recording_stopped_at,
          processing_started_at,
          audio_analysis_completed_at,
          transcription_started_at,
          provider_request_started_at,
          provider_response_received_at,
          transcription_completed_at,
          insertion_started_at,
          insertion_completed_at,
          record_persisted_at,
          recording_duration_ms,
          audio_analysis_duration_ms,
          processing_duration_ms,
          transcription_duration_ms,
          provider_roundtrip_ms,
          provider_total_roundtrip_ms,
          provider_max_roundtrip_ms,
          insertion_duration_ms,
          provider_request_count,
          audio_byte_length,
          provider_model_id,
          error_code,
          payload_json
        ) VALUES (
          ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15,
          ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29,
          ?30, ?31, ?32, ?33, ?34, ?35, ?36, ?37, ?38, ?39, ?40, ?41, ?42, ?43,
          ?44
        )
        "#,
        params![
            row.record_id,
            row.schema_version,
            row.session_id,
            row.user_id,
            row.installation_id,
            row.device_id,
            row.captured_at,
            row.created_at,
            row.updated_at,
            row.mode,
            row.trigger,
            row.platform,
            row.status,
            row.provider_id,
            row.raw_text,
            row.final_text,
            row.target_window_title,
            row.target_control_name,
            row.audio_relative_path,
            row.processed_audio_relative_path,
            row.recording_started_at,
            row.recording_stopped_at,
            row.processing_started_at,
            row.audio_analysis_completed_at,
            row.transcription_started_at,
            row.provider_request_started_at,
            row.provider_response_received_at,
            row.transcription_completed_at,
            row.insertion_started_at,
            row.insertion_completed_at,
            row.record_persisted_at,
            row.recording_duration_ms,
            row.audio_analysis_duration_ms,
            row.processing_duration_ms,
            row.transcription_duration_ms,
            row.provider_roundtrip_ms,
            row.provider_total_roundtrip_ms,
            row.provider_max_roundtrip_ms,
            row.insertion_duration_ms,
            row.provider_request_count,
            row.audio_byte_length,
            row.provider_model_id,
            row.error_code,
            row.payload_json,
        ],
    )
    .map_err(sqlite_error)?;
    sync_provider_request_rows(tx, record)?;
    sync_provider_event_rows(tx, record)
}

fn legacy_record_exists(tx: &Transaction<'_>, record_id: &str) -> Result<bool, ProviderError> {
    tx.query_row(
        "SELECT 1 FROM dictation_records WHERE record_id = ?1",
        params![record_id],
        |_| Ok(true),
    )
    .optional()
    .map(|value| value.unwrap_or(false))
    .map_err(sqlite_error)
}

struct SqliteDictationRecordRow {
    record_id: String,
    schema_version: u32,
    session_id: String,
    user_id: String,
    installation_id: String,
    device_id: String,
    captured_at: String,
    created_at: String,
    updated_at: String,
    mode: String,
    trigger: String,
    platform: String,
    status: String,
    provider_id: Option<String>,
    raw_text: String,
    final_text: String,
    target_window_title: String,
    target_control_name: String,
    audio_relative_path: Option<String>,
    processed_audio_relative_path: Option<String>,
    recording_started_at: Option<String>,
    recording_stopped_at: Option<String>,
    processing_started_at: Option<String>,
    audio_analysis_completed_at: Option<String>,
    transcription_started_at: Option<String>,
    provider_request_started_at: Option<String>,
    provider_response_received_at: Option<String>,
    transcription_completed_at: Option<String>,
    insertion_started_at: Option<String>,
    insertion_completed_at: Option<String>,
    record_persisted_at: Option<String>,
    recording_duration_ms: Option<i64>,
    audio_analysis_duration_ms: Option<i64>,
    processing_duration_ms: Option<i64>,
    transcription_duration_ms: Option<i64>,
    provider_roundtrip_ms: Option<i64>,
    provider_total_roundtrip_ms: Option<i64>,
    provider_max_roundtrip_ms: Option<i64>,
    insertion_duration_ms: Option<i64>,
    provider_request_count: i64,
    audio_byte_length: Option<i64>,
    provider_model_id: Option<String>,
    error_code: Option<String>,
    payload_json: String,
}

impl SqliteDictationRecordRow {
    fn from_record(
        record: &DictationRecordV1,
        created_at: &str,
        updated_at: &str,
    ) -> Result<Self, ProviderError> {
        let timeline = record.timeline.as_ref();
        Ok(Self {
            record_id: record.record_id.clone(),
            schema_version: record.schema_version,
            session_id: record.session_id.clone(),
            user_id: record.user_id.clone(),
            installation_id: record.installation_id.clone(),
            device_id: record.device_id.clone(),
            captured_at: record.captured_at.clone(),
            created_at: created_at.to_string(),
            updated_at: updated_at.to_string(),
            mode: record.mode.clone(),
            trigger: record.trigger.clone(),
            platform: record.platform.clone(),
            status: record.insertion.status.clone(),
            provider_id: record
                .provider
                .as_ref()
                .map(|provider| provider.provider_id.clone()),
            raw_text: record.transcript.raw_text.clone(),
            final_text: record.transcript.final_text.clone(),
            target_window_title: record.target.window_title.clone(),
            target_control_name: record.target.control_name.clone(),
            audio_relative_path: record
                .audio
                .as_ref()
                .map(|audio| audio.relative_path.clone()),
            processed_audio_relative_path: record
                .processed_audio
                .as_ref()
                .map(|audio| audio.relative_path.clone()),
            recording_started_at: timeline.and_then(|value| value.recording_started_at.clone()),
            recording_stopped_at: timeline.and_then(|value| value.recording_stopped_at.clone()),
            processing_started_at: timeline.and_then(|value| value.processing_started_at.clone()),
            audio_analysis_completed_at: timeline
                .and_then(|value| value.audio_analysis_completed_at.clone()),
            transcription_started_at: timeline
                .and_then(|value| value.transcription_started_at.clone()),
            provider_request_started_at: timeline
                .and_then(|value| value.provider_request_started_at.clone()),
            provider_response_received_at: timeline
                .and_then(|value| value.provider_response_received_at.clone()),
            transcription_completed_at: timeline
                .and_then(|value| value.transcription_completed_at.clone()),
            insertion_started_at: timeline.and_then(|value| value.insertion_started_at.clone()),
            insertion_completed_at: timeline.and_then(|value| value.insertion_completed_at.clone()),
            record_persisted_at: timeline.and_then(|value| value.record_persisted_at.clone()),
            recording_duration_ms: duration_between_ms(
                timeline.and_then(|value| value.recording_started_at.as_deref()),
                timeline.and_then(|value| value.recording_stopped_at.as_deref()),
            ),
            audio_analysis_duration_ms: duration_between_ms(
                timeline.and_then(|value| value.processing_started_at.as_deref()),
                timeline.and_then(|value| value.audio_analysis_completed_at.as_deref()),
            ),
            processing_duration_ms: duration_between_ms(
                timeline.and_then(|value| value.processing_started_at.as_deref()),
                timeline.and_then(|value| value.record_persisted_at.as_deref()),
            ),
            transcription_duration_ms: duration_between_ms(
                timeline.and_then(|value| value.transcription_started_at.as_deref()),
                timeline.and_then(|value| value.transcription_completed_at.as_deref()),
            ),
            provider_roundtrip_ms: duration_between_ms(
                timeline.and_then(|value| value.provider_request_started_at.as_deref()),
                timeline.and_then(|value| value.provider_response_received_at.as_deref()),
            ),
            provider_total_roundtrip_ms: provider_request_total_roundtrip_ms(timeline),
            provider_max_roundtrip_ms: provider_request_max_roundtrip_ms(timeline),
            insertion_duration_ms: duration_between_ms(
                timeline.and_then(|value| value.insertion_started_at.as_deref()),
                timeline.and_then(|value| value.insertion_completed_at.as_deref()),
            ),
            provider_request_count: timeline
                .map(|value| value.provider_requests.len() as i64)
                .unwrap_or(0),
            audio_byte_length: record.audio.as_ref().map(|audio| audio.byte_length as i64),
            provider_model_id: record
                .provider
                .as_ref()
                .and_then(|provider| provider.model_id.clone()),
            error_code: record.insertion.error_code.clone(),
            payload_json: serde_json::to_string(record).map_err(storage_error)?,
        })
    }
}

fn add_timeline_columns_if_missing(tx: &Transaction<'_>) -> Result<(), ProviderError> {
    for (name, column_type) in [
        ("recording_started_at", "TEXT"),
        ("recording_stopped_at", "TEXT"),
        ("processing_started_at", "TEXT"),
        ("audio_analysis_completed_at", "TEXT"),
        ("transcription_started_at", "TEXT"),
        ("provider_request_started_at", "TEXT"),
        ("provider_response_received_at", "TEXT"),
        ("transcription_completed_at", "TEXT"),
        ("insertion_started_at", "TEXT"),
        ("insertion_completed_at", "TEXT"),
        ("record_persisted_at", "TEXT"),
        ("recording_duration_ms", "INTEGER"),
        ("audio_analysis_duration_ms", "INTEGER"),
        ("processing_duration_ms", "INTEGER"),
        ("transcription_duration_ms", "INTEGER"),
        ("provider_roundtrip_ms", "INTEGER"),
        ("provider_total_roundtrip_ms", "INTEGER"),
        ("provider_max_roundtrip_ms", "INTEGER"),
        ("insertion_duration_ms", "INTEGER"),
        ("provider_request_count", "INTEGER"),
        ("audio_byte_length", "INTEGER"),
        ("provider_model_id", "TEXT"),
        ("error_code", "TEXT"),
    ] {
        if !table_has_column(tx, "dictation_records", name)? {
            tx.execute(
                &format!("ALTER TABLE dictation_records ADD COLUMN {name} {column_type}"),
                [],
            )
            .map_err(sqlite_error)?;
        }
    }

    Ok(())
}

fn create_analytics_indexes(conn: &Connection) -> Result<(), ProviderError> {
    conn.execute_batch(
        r#"
        CREATE INDEX IF NOT EXISTS idx_dictation_records_provider
          ON dictation_records(provider_id, captured_at DESC);

        CREATE INDEX IF NOT EXISTS idx_dictation_records_provider_model
          ON dictation_records(provider_model_id, captured_at DESC);

        CREATE INDEX IF NOT EXISTS idx_dictation_records_error
          ON dictation_records(status, error_code, captured_at DESC);

        CREATE INDEX IF NOT EXISTS idx_dictation_records_processing_started
          ON dictation_records(processing_started_at, captured_at DESC);

        CREATE INDEX IF NOT EXISTS idx_dictation_provider_requests_record
          ON dictation_provider_requests(record_id);

            CREATE INDEX IF NOT EXISTS idx_dictation_provider_requests_provider
              ON dictation_provider_requests(provider_id, model_id, started_at);

            CREATE UNIQUE INDEX IF NOT EXISTS idx_dictation_provider_requests_record_segment_attempt
              ON dictation_provider_requests(record_id, segment_index, attempt_index);

            CREATE INDEX IF NOT EXISTS idx_dictation_provider_requests_status
              ON dictation_provider_requests(status, error_code, started_at);

            CREATE INDEX IF NOT EXISTS idx_dictation_provider_events_record
              ON dictation_provider_events(record_id, created_at);

            CREATE INDEX IF NOT EXISTS idx_dictation_provider_events_provider_mode
              ON dictation_provider_events(provider_id, provider_mode, event_type, created_at);
        "#,
    )
    .map_err(sqlite_error)
}

fn table_has_column(
    conn: &Connection,
    table_name: &str,
    column_name: &str,
) -> Result<bool, ProviderError> {
    let mut statement = conn
        .prepare(&format!("PRAGMA table_info({table_name})"))
        .map_err(sqlite_error)?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(sqlite_error)?;

    for row in rows {
        if row.map_err(sqlite_error)? == column_name {
            return Ok(true);
        }
    }

    Ok(false)
}

fn table_has_index(conn: &Connection, index_name: &str) -> Result<bool, ProviderError> {
    conn.query_row(
        "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?1",
        params![index_name],
        |_| Ok(true),
    )
    .optional()
    .map(|value| value.unwrap_or(false))
    .map_err(sqlite_error)
}

fn backfill_timeline_columns(conn: &Connection) -> Result<(), ProviderError> {
    let mut statement = conn
        .prepare("SELECT record_id, payload_json FROM dictation_records")
        .map_err(sqlite_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(sqlite_error)?;
    let mut payloads = Vec::new();
    for row in rows {
        payloads.push(row.map_err(sqlite_error)?);
    }
    drop(statement);

    for (record_id, payload_json) in payloads {
        let record =
            serde_json::from_str::<DictationRecordV1>(&payload_json).map_err(storage_error)?;
        let row = SqliteDictationRecordRow::from_record(&record, "", "")?;
        conn.execute(
            r#"
            UPDATE dictation_records
            SET recording_started_at = ?2,
                recording_stopped_at = ?3,
                processing_started_at = ?4,
                audio_analysis_completed_at = ?5,
                transcription_started_at = ?6,
                provider_request_started_at = ?7,
                provider_response_received_at = ?8,
                transcription_completed_at = ?9,
                insertion_started_at = ?10,
                insertion_completed_at = ?11,
                record_persisted_at = ?12,
                recording_duration_ms = ?13,
                audio_analysis_duration_ms = ?14,
                processing_duration_ms = ?15,
                transcription_duration_ms = ?16,
                provider_roundtrip_ms = ?17,
                provider_total_roundtrip_ms = ?18,
                provider_max_roundtrip_ms = ?19,
                insertion_duration_ms = ?20,
                provider_request_count = ?21,
                audio_byte_length = ?22,
                provider_model_id = ?23,
                error_code = ?24
            WHERE record_id = ?1
            "#,
            params![
                record_id,
                row.recording_started_at,
                row.recording_stopped_at,
                row.processing_started_at,
                row.audio_analysis_completed_at,
                row.transcription_started_at,
                row.provider_request_started_at,
                row.provider_response_received_at,
                row.transcription_completed_at,
                row.insertion_started_at,
                row.insertion_completed_at,
                row.record_persisted_at,
                row.recording_duration_ms,
                row.audio_analysis_duration_ms,
                row.processing_duration_ms,
                row.transcription_duration_ms,
                row.provider_roundtrip_ms,
                row.provider_total_roundtrip_ms,
                row.provider_max_roundtrip_ms,
                row.insertion_duration_ms,
                row.provider_request_count,
                row.audio_byte_length,
                row.provider_model_id,
                row.error_code,
            ],
        )
        .map_err(sqlite_error)?;
        sync_provider_request_rows(conn, &record)?;
        sync_provider_event_rows(conn, &record)?;
    }

    Ok(())
}

fn sync_provider_request_rows(
    conn: &Connection,
    record: &DictationRecordV1,
) -> Result<(), ProviderError> {
    conn.execute(
        "DELETE FROM dictation_provider_requests WHERE record_id = ?1",
        params![record.record_id],
    )
    .map_err(sqlite_error)?;

    let Some(timeline) = record.timeline.as_ref() else {
        return Ok(());
    };

    let mut next_attempt_by_segment: HashMap<usize, i64> = HashMap::new();
    for request in &timeline.provider_requests {
        let attempt_index = next_attempt_by_segment
            .entry(request.segment_index)
            .and_modify(|value| *value += 1)
            .or_insert(0);
        let duration_ms = duration_between_ms(
            Some(request.started_at.as_str()),
            Some(request.completed_at.as_str()),
        );
        let (status, error_code) = provider_request_outcome(record, request)?;
        conn.execute(
            r#"
            INSERT INTO dictation_provider_requests (
              record_id,
              segment_index,
              attempt_index,
              provider_id,
              model_id,
              started_at,
              completed_at,
              duration_ms,
              status,
              error_code
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            "#,
            params![
                record.record_id,
                request.segment_index as i64,
                *attempt_index,
                request.provider_id.as_str(),
                request.model_id.as_deref(),
                request.started_at.as_str(),
                request.completed_at.as_str(),
                duration_ms,
                status,
                error_code,
            ],
        )
        .map_err(sqlite_error)?;
    }

    Ok(())
}

fn sync_provider_event_rows(
    conn: &Connection,
    record: &DictationRecordV1,
) -> Result<(), ProviderError> {
    conn.execute(
        "DELETE FROM dictation_provider_events WHERE record_id = ?1",
        params![record.record_id],
    )
    .map_err(sqlite_error)?;

    let Some(timeline) = record.timeline.as_ref() else {
        return Ok(());
    };

    for event in &timeline.provider_events {
        let metadata_json = sanitized_provider_event_metadata(event.metadata.as_ref())?;
        conn.execute(
            r#"
            INSERT INTO dictation_provider_events (
              event_id,
              record_id,
              provider_request_id,
              provider_id,
              model_id,
              provider_mode,
              session_id,
              event_type,
              stage,
              started_at,
              completed_at,
              duration_ms,
              status,
              error_code,
              bytes_sent,
              frame_count,
              metadata_json,
              created_at
            ) VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
            "#,
            params![
                Uuid::new_v4().to_string(),
                record.record_id.as_str(),
                event.provider_id.as_str(),
                event.model_id.as_deref(),
                event.provider_mode.as_str(),
                event.session_id.as_deref(),
                event.event_type.as_str(),
                event.stage.as_deref(),
                event.started_at.as_deref(),
                event.completed_at.as_deref(),
                event.duration_ms,
                event.status.as_deref(),
                event.error_code.as_deref(),
                event.bytes_sent,
                event.frame_count,
                metadata_json.as_deref(),
                current_utc_timestamp(),
            ],
        )
        .map_err(sqlite_error)?;
    }

    Ok(())
}

fn sanitized_provider_event_metadata(
    metadata: Option<&serde_json::Value>,
) -> Result<Option<String>, ProviderError> {
    let Some(metadata) = metadata else {
        return Ok(None);
    };

    let sanitized = sanitize_provider_event_metadata_value(metadata);
    if sanitized.is_null() {
        return Ok(None);
    }

    serde_json::to_string(&sanitized)
        .map(Some)
        .map_err(storage_error)
}

fn sanitize_provider_event_metadata_value(value: &serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Object(map) => serde_json::Value::Object(
            map.iter()
                .filter_map(|(key, value)| {
                    if is_sensitive_provider_event_metadata_key(key) {
                        None
                    } else {
                        Some((key.clone(), sanitize_provider_event_metadata_value(value)))
                    }
                })
                .collect(),
        ),
        serde_json::Value::Array(values) => serde_json::Value::Array(
            values
                .iter()
                .map(sanitize_provider_event_metadata_value)
                .collect(),
        ),
        _ => value.clone(),
    }
}

fn is_sensitive_provider_event_metadata_key(key: &str) -> bool {
    let key = key.to_ascii_lowercase();
    key.contains("text")
        || key.contains("transcript")
        || key.contains("prompt")
        || key.contains("authorization")
        || key.contains("api_key")
        || key.contains("apikey")
}

fn provider_request_outcome<'a>(
    record: &'a DictationRecordV1,
    request: &'a DictationProviderRequestTiming,
) -> Result<(&'a str, Option<&'a str>), ProviderError> {
    if let Some(status) = request.status.as_deref() {
        if status != "succeeded" && status != "failed" {
            return Err(ProviderFailure::SettingsStore(format!(
                "provider request status is invalid: {status}"
            ))
            .into());
        }
        return Ok((status, request.error_code.as_deref()));
    }

    Ok(match record.insertion.error_code.as_deref() {
        Some("transcription_failed") | Some("invalid_provider_response") => {
            ("failed", record.insertion.error_code.as_deref())
        }
        _ => ("succeeded", None),
    })
}

fn duration_between_ms(started_at: Option<&str>, completed_at: Option<&str>) -> Option<i64> {
    let started_at = chrono::DateTime::parse_from_rfc3339(started_at?).ok()?;
    let completed_at = chrono::DateTime::parse_from_rfc3339(completed_at?).ok()?;
    let duration = completed_at.signed_duration_since(started_at);
    if duration.num_milliseconds() < 0 {
        return None;
    }

    Some(duration.num_milliseconds())
}

fn provider_request_durations(timeline: Option<&DictationTimeline>) -> Vec<i64> {
    let Some(timeline) = timeline else {
        return Vec::new();
    };

    timeline
        .provider_requests
        .iter()
        .filter_map(|request| {
            duration_between_ms(
                Some(request.started_at.as_str()),
                Some(request.completed_at.as_str()),
            )
        })
        .collect()
}

fn provider_request_total_roundtrip_ms(timeline: Option<&DictationTimeline>) -> Option<i64> {
    let durations = provider_request_durations(timeline);
    if durations.is_empty() {
        return None;
    }

    Some(durations.iter().sum())
}

fn provider_request_max_roundtrip_ms(timeline: Option<&DictationTimeline>) -> Option<i64> {
    provider_request_durations(timeline).into_iter().max()
}

fn current_utc_timestamp() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn sqlite_error(err: rusqlite::Error) -> ProviderError {
    ProviderFailure::SettingsStore(err.to_string()).into()
}

fn storage_error(err: impl std::fmt::Display) -> ProviderError {
    ProviderFailure::SettingsStore(err.to_string()).into()
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

fn validate_audio_artifact_paths(draft: &DictationRecordDraftV1) -> Result<(), ProviderError> {
    for artifact in [&draft.audio, &draft.processed_audio].into_iter().flatten() {
        if !is_safe_relative_audio_path(Path::new(&artifact.relative_path)) {
            return Err(ProviderFailure::InvalidRequest("invalid audio path".to_string()).into());
        }
    }

    Ok(())
}

fn validate_update_audio_artifact_paths(
    patch: &DictationRecordUpdateV1,
) -> Result<(), ProviderError> {
    if let Some(artifact) = &patch.processed_audio {
        if !is_safe_relative_audio_path(Path::new(&artifact.relative_path)) {
            return Err(ProviderFailure::InvalidRequest("invalid audio path".to_string()).into());
        }
    }

    Ok(())
}

fn next_available_export_path(export_dir: &Path, file_name: &str) -> PathBuf {
    let candidate = export_dir.join(file_name);
    if !candidate.exists() {
        return candidate;
    }

    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("vaak-recording");
    let extension = Path::new(file_name)
        .extension()
        .and_then(|value| value.to_str());

    for suffix in 2.. {
        let candidate_name = match extension {
            Some(extension) if !extension.is_empty() => format!("{stem}-{suffix}.{extension}"),
            _ => format!("{stem}-{suffix}"),
        };
        let candidate = export_dir.join(candidate_name);
        if !candidate.exists() {
            return candidate;
        }
    }

    unreachable!("export filename search should always terminate")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::Write;
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
                analysis_ms: Some(12),
                transcription_ms: Some(600),
                insertion_ms: None,
                post_processing_ms: Some(40),
            }),
            audio: Some(DictationAudioArtifact {
                relative_path: "recordings/2026/05/02/a86f0b9f.webm".to_string(),
                mime_type: "audio/webm".to_string(),
                byte_length: 2048,
            }),
            processed_audio: None,
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
            timeline: Some(DictationTimeline {
                recording_started_at: Some("2026-05-02T08:30:01.000Z".to_string()),
                recording_stopped_at: Some("2026-05-02T08:30:04.000Z".to_string()),
                processing_started_at: Some("2026-05-02T08:30:04.010Z".to_string()),
                audio_analysis_completed_at: Some("2026-05-02T08:30:04.020Z".to_string()),
                transcription_started_at: Some("2026-05-02T08:30:04.030Z".to_string()),
                provider_request_started_at: Some("2026-05-02T08:30:04.100Z".to_string()),
                provider_response_received_at: Some("2026-05-02T08:30:05.300Z".to_string()),
                transcription_completed_at: Some("2026-05-02T08:30:05.350Z".to_string()),
                insertion_started_at: Some("2026-05-02T08:30:05.400Z".to_string()),
                insertion_completed_at: Some("2026-05-02T08:30:05.550Z".to_string()),
                record_persisted_at: Some("2026-05-02T08:30:05.600Z".to_string()),
                provider_requests: vec![DictationProviderRequestTiming {
                    segment_index: 0,
                    started_at: "2026-05-02T08:30:04.100Z".to_string(),
                    completed_at: "2026-05-02T08:30:05.300Z".to_string(),
                    provider_id: "openai".to_string(),
                    model_id: Some("gpt-4o-mini-transcribe".to_string()),
                    status: Some("succeeded".to_string()),
                    error_code: None,
                }],
                provider_events: Vec::new(),
            }),
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
                    "reusedWarmStream": false,
                    "analysisMs": 12,
                    "transcriptionMs": 600,
                    "postProcessingMs": 40
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
                },
                "timeline": {
                    "recordingStartedAt": "2026-05-02T08:30:01.000Z",
                    "recordingStoppedAt": "2026-05-02T08:30:04.000Z",
                    "processingStartedAt": "2026-05-02T08:30:04.010Z",
                    "audioAnalysisCompletedAt": "2026-05-02T08:30:04.020Z",
                    "transcriptionStartedAt": "2026-05-02T08:30:04.030Z",
                    "providerRequestStartedAt": "2026-05-02T08:30:04.100Z",
                    "providerResponseReceivedAt": "2026-05-02T08:30:05.300Z",
                    "transcriptionCompletedAt": "2026-05-02T08:30:05.350Z",
                    "insertionStartedAt": "2026-05-02T08:30:05.400Z",
                    "insertionCompletedAt": "2026-05-02T08:30:05.550Z",
                    "recordPersistedAt": "2026-05-02T08:30:05.600Z",
                    "providerRequests": [{
                        "segmentIndex": 0,
                        "startedAt": "2026-05-02T08:30:04.100Z",
                        "completedAt": "2026-05-02T08:30:05.300Z",
                        "providerId": "openai",
                        "modelId": "gpt-4o-mini-transcribe",
                        "status": "succeeded"
                    }]
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
                analysis_ms: None,
                transcription_ms: None,
                insertion_ms: None,
                post_processing_ms: None,
            }),
            audio: Some(DictationAudioArtifact {
                relative_path: "recordings/2026/05/02/a86f0b9f.webm".to_string(),
                mime_type: "audio/webm".to_string(),
                byte_length: 2048,
            }),
            processed_audio: None,
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
            timeline: None,
        };

        let saved = store.save(&settings, draft).unwrap();
        let expected_identity = settings.local_identity().unwrap();
        let recent = store.list_recent(10, 0).unwrap();

        assert_eq!(saved.schema_version, 1);
        assert_eq!(saved.user_id, expected_identity.user_id);
        assert_eq!(saved.installation_id, expected_identity.installation_id);
        assert_eq!(saved.device_id, expected_identity.device_id);
        assert_eq!(saved.platform, std::env::consts::OS);
        assert!(dir.join("dictation-records.sqlite").exists());
        assert!(!dir.join("dictation-records.jsonl").exists());
        assert_eq!(recent, vec![saved]);
    }

    #[test]
    fn initializes_sqlite_schema_version_two_with_timeline_columns_and_provider_event_table() {
        let dir = temp_config_dir("dictation-record-schema-v2");
        let settings = crate::storage::LocalSettingsStore::new(&dir);
        let store = LocalDictationRecordStore::new(&dir);

        store
            .save(&settings, failed_record_draft("session-schema-v2", "raw"))
            .unwrap();

        let conn = Connection::open(dir.join("dictation-records.sqlite")).unwrap();
        let user_version: u32 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();

        assert_eq!(user_version, 2);
        assert!(table_has_column(&conn, "dictation_records", "provider_roundtrip_ms").unwrap());
        assert!(table_has_column(&conn, "dictation_records", "provider_model_id").unwrap());
        assert!(table_has_column(&conn, "dictation_records", "record_persisted_at").unwrap());
        assert!(table_has_column(&conn, "dictation_records", "provider_request_count").unwrap());
        assert!(table_has_column(&conn, "dictation_provider_requests", "duration_ms").unwrap());
        assert!(table_has_column(&conn, "dictation_provider_events", "event_type").unwrap());
        assert!(table_has_column(&conn, "dictation_provider_events", "metadata_json").unwrap());
        assert!(table_has_index(&conn, "idx_dictation_records_provider_model").unwrap());
        assert!(table_has_index(&conn, "idx_dictation_records_error").unwrap());
        assert!(table_has_index(&conn, "idx_dictation_provider_requests_provider").unwrap());
        assert!(table_has_index(
            &conn,
            "idx_dictation_provider_requests_record_segment_attempt"
        )
        .unwrap());
        assert!(table_has_index(&conn, "idx_dictation_provider_requests_status").unwrap());
        assert!(table_has_index(&conn, "idx_dictation_provider_events_record").unwrap());
        assert!(table_has_index(&conn, "idx_dictation_provider_events_provider_mode").unwrap());
    }

    #[test]
    fn migrates_sqlite_schema_version_one_to_provider_event_table() {
        let dir = temp_config_dir("dictation-record-schema-v1-migration");
        fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("dictation-records.sqlite");
        let conn = Connection::open(&db_path).unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE schema_migrations (
              version INTEGER PRIMARY KEY,
              applied_at TEXT NOT NULL
            );
            INSERT INTO schema_migrations (version, applied_at)
            VALUES (1, '2026-05-02T08:30:00.000Z');
            PRAGMA user_version = 1;
            "#,
        )
        .unwrap();
        drop(conn);

        let store = LocalDictationRecordStore::new(&dir);
        let records = store.list_recent(10, 0).unwrap();

        let conn = Connection::open(db_path).unwrap();
        let user_version: u32 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();

        assert!(records.is_empty());
        assert_eq!(user_version, 2);
        assert!(table_has_column(&conn, "dictation_provider_events", "event_type").unwrap());
        assert!(table_has_index(&conn, "idx_dictation_provider_events_record").unwrap());
    }

    #[test]
    fn populates_timeline_chart_columns_from_saved_record() {
        let dir = temp_config_dir("dictation-record-timeline-columns");
        let settings = crate::storage::LocalSettingsStore::new(&dir);
        let store = LocalDictationRecordStore::new(&dir);
        let mut draft = failed_record_draft("session-timeline", "raw");
        draft.insertion.error_code = Some("insertion_failed".to_string());
        draft.timeline = Some(DictationTimeline {
            recording_started_at: Some("2026-05-02T08:30:01.000Z".to_string()),
            recording_stopped_at: Some("2026-05-02T08:30:04.000Z".to_string()),
            processing_started_at: Some("2026-05-02T08:30:04.010Z".to_string()),
            audio_analysis_completed_at: Some("2026-05-02T08:30:04.020Z".to_string()),
            transcription_started_at: Some("2026-05-02T08:30:04.030Z".to_string()),
            provider_request_started_at: Some("2026-05-02T08:30:04.100Z".to_string()),
            provider_response_received_at: Some("2026-05-02T08:30:05.300Z".to_string()),
            transcription_completed_at: Some("2026-05-02T08:30:05.350Z".to_string()),
            insertion_started_at: Some("2026-05-02T08:30:05.400Z".to_string()),
            insertion_completed_at: Some("2026-05-02T08:30:05.550Z".to_string()),
            record_persisted_at: Some("2026-05-02T08:30:05.600Z".to_string()),
            provider_requests: vec![DictationProviderRequestTiming {
                segment_index: 0,
                started_at: "2026-05-02T08:30:04.100Z".to_string(),
                completed_at: "2026-05-02T08:30:05.300Z".to_string(),
                provider_id: "openai".to_string(),
                model_id: Some("gpt-4o-mini-transcribe".to_string()),
                status: Some("succeeded".to_string()),
                error_code: None,
            }],
            provider_events: Vec::new(),
        });

        store.save(&settings, draft).unwrap();

        let conn = Connection::open(dir.join("dictation-records.sqlite")).unwrap();
        let row = conn
            .query_row(
                r#"
                SELECT recording_started_at,
                       provider_request_started_at,
                       provider_response_received_at,
                       recording_duration_ms,
                       processing_duration_ms,
                       provider_roundtrip_ms,
                       audio_analysis_completed_at,
                       record_persisted_at,
                       transcription_duration_ms,
                       insertion_duration_ms,
                       provider_request_count,
                       audio_byte_length,
                       provider_model_id,
                       error_code
                FROM dictation_records
                WHERE session_id = 'session-timeline'
                "#,
                [],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, i64>(3)?,
                        row.get::<_, i64>(4)?,
                        row.get::<_, i64>(5)?,
                        row.get::<_, String>(6)?,
                        row.get::<_, String>(7)?,
                        row.get::<_, i64>(8)?,
                        row.get::<_, i64>(9)?,
                        row.get::<_, i64>(10)?,
                        row.get::<_, i64>(11)?,
                        row.get::<_, String>(12)?,
                        row.get::<_, String>(13)?,
                    ))
                },
            )
            .unwrap();

        assert_eq!(row.0, "2026-05-02T08:30:01.000Z");
        assert_eq!(row.1, "2026-05-02T08:30:04.100Z");
        assert_eq!(row.2, "2026-05-02T08:30:05.300Z");
        assert_eq!(row.3, 3_000);
        assert_eq!(row.4, 1_590);
        assert_eq!(row.5, 1_200);
        assert_eq!(row.6, "2026-05-02T08:30:04.020Z");
        assert_eq!(row.7, "2026-05-02T08:30:05.600Z");
        assert_eq!(row.8, 1_320);
        assert_eq!(row.9, 150);
        assert_eq!(row.10, 1);
        assert_eq!(row.11, 2_048);
        assert_eq!(row.12, "gpt-4o-mini-transcribe");
        assert_eq!(row.13, "insertion_failed");

        let provider_request = conn
            .query_row(
                r#"
                SELECT segment_index,
                       attempt_index,
                       provider_id,
                       model_id,
                       started_at,
                       completed_at,
                       duration_ms,
                       status,
                       error_code
                FROM dictation_provider_requests
                WHERE record_id = (SELECT record_id FROM dictation_records WHERE session_id = 'session-timeline')
                "#,
                [],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                        row.get::<_, i64>(6)?,
                        row.get::<_, String>(7)?,
                        row.get::<_, Option<String>>(8)?,
                    ))
                },
            )
            .unwrap();

        assert_eq!(provider_request.0, 0);
        assert_eq!(provider_request.1, 0);
        assert_eq!(provider_request.2, "openai");
        assert_eq!(provider_request.3, "gpt-4o-mini-transcribe");
        assert_eq!(provider_request.4, "2026-05-02T08:30:04.100Z");
        assert_eq!(provider_request.5, "2026-05-02T08:30:05.300Z");
        assert_eq!(provider_request.6, 1_200);
        assert_eq!(provider_request.7, "succeeded");
        assert_eq!(provider_request.8, None);
    }

    #[test]
    fn persists_provider_timeline_events_without_transcript_text() {
        let dir = temp_config_dir("dictation-record-provider-events");
        let settings = crate::storage::LocalSettingsStore::new(&dir);
        let store = LocalDictationRecordStore::new(&dir);
        let mut draft = failed_record_draft("session-provider-events", "raw");
        draft.provider = Some(DictationProviderContext {
            provider_id: "assemblyai".to_string(),
            model_id: Some("universal-3-pro".to_string()),
        });
        draft.timeline = Some(DictationTimeline {
            recording_started_at: None,
            recording_stopped_at: None,
            processing_started_at: None,
            audio_analysis_completed_at: None,
            transcription_started_at: None,
            provider_request_started_at: Some("2026-05-02T08:30:04.100Z".to_string()),
            provider_response_received_at: Some("2026-05-02T08:30:09.300Z".to_string()),
            transcription_completed_at: None,
            insertion_started_at: None,
            insertion_completed_at: None,
            record_persisted_at: None,
            provider_requests: Vec::new(),
            provider_events: vec![DictationProviderTimelineEvent {
                event_type: "stage".to_string(),
                provider_id: "assemblyai".to_string(),
                model_id: Some("universal-3-pro".to_string()),
                provider_mode: "async".to_string(),
                session_id: Some("transcript-123".to_string()),
                stage: Some("upload".to_string()),
                started_at: Some("2026-05-02T08:30:04.100Z".to_string()),
                completed_at: Some("2026-05-02T08:30:04.450Z".to_string()),
                duration_ms: Some(350),
                status: Some("succeeded".to_string()),
                error_code: None,
                bytes_sent: Some(2048),
                frame_count: None,
                metadata: Some(serde_json::json!({
                    "pollCount": 3,
                    "transcriptText": "must not be stored"
                })),
            }],
        });

        store.save(&settings, draft).unwrap();

        let conn = Connection::open(dir.join("dictation-records.sqlite")).unwrap();
        let row = conn
            .query_row(
                r#"
                SELECT provider_id,
                       model_id,
                       provider_mode,
                       session_id,
                       event_type,
                       stage,
                       duration_ms,
                       status,
                       bytes_sent,
                       metadata_json
                FROM dictation_provider_events
                WHERE record_id = (SELECT record_id FROM dictation_records WHERE session_id = 'session-provider-events')
                "#,
                [],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                        row.get::<_, i64>(6)?,
                        row.get::<_, String>(7)?,
                        row.get::<_, i64>(8)?,
                        row.get::<_, Option<String>>(9)?,
                    ))
                },
            )
            .unwrap();

        assert_eq!(row.0, "assemblyai");
        assert_eq!(row.1, "universal-3-pro");
        assert_eq!(row.2, "async");
        assert_eq!(row.3, "transcript-123");
        assert_eq!(row.4, "stage");
        assert_eq!(row.5, "upload");
        assert_eq!(row.6, 350);
        assert_eq!(row.7, "succeeded");
        assert_eq!(row.8, 2048);
        let metadata = row.9.expect("metadata json");
        assert!(metadata.contains("pollCount"));
        assert!(!metadata.contains("must not be stored"));
        assert!(!metadata.contains("transcriptText"));
    }

    #[test]
    fn rejects_invalid_provider_request_status() {
        let dir = temp_config_dir("dictation-record-invalid-provider-request-status");
        let settings = crate::storage::LocalSettingsStore::new(&dir);
        let store = LocalDictationRecordStore::new(&dir);
        let mut draft = failed_record_draft("session-invalid-provider-request-status", "raw");
        draft.timeline = Some(DictationTimeline {
            recording_started_at: None,
            recording_stopped_at: None,
            processing_started_at: None,
            audio_analysis_completed_at: None,
            transcription_started_at: None,
            provider_request_started_at: None,
            provider_response_received_at: None,
            transcription_completed_at: None,
            insertion_started_at: None,
            insertion_completed_at: None,
            record_persisted_at: None,
            provider_requests: vec![DictationProviderRequestTiming {
                segment_index: 0,
                started_at: "2026-05-02T08:30:04.100Z".to_string(),
                completed_at: "2026-05-02T08:30:05.300Z".to_string(),
                provider_id: "openai".to_string(),
                model_id: Some("gpt-4o-mini-transcribe".to_string()),
                status: Some("unknown".to_string()),
                error_code: None,
            }],
            provider_events: Vec::new(),
        });

        let err = store
            .save(&settings, draft)
            .expect_err("invalid provider request status should fail");

        assert_eq!(err.code, "settings_store_failed");
        assert!(err.message.contains("provider request status is invalid"));
    }

    #[test]
    fn deserializes_old_payload_without_timeline() {
        let payload = r#"{"schemaVersion":1,"recordId":"a86f0b9f-0f5a-48e8-a24f-2851cb4be4df","userId":"3fd61656-c0e8-4b3c-b37f-18d85ed43499","installationId":"9d4f4d32-236d-4f12-b88e-b01eb0fdfca3","deviceId":"560fcc96-03a4-41da-8d2a-95f5db67e6c7","sessionId":"0938f4c2-8f2f-4490-a91e-d408f810090e","mode":"dictation","trigger":"hotkey","platform":"windows","capturedAt":"2026-05-02T08:30:00Z","startedAt":null,"endedAt":null,"target":{"stableId":"target","windowTitle":"Notes","controlName":"Message","controlType":"Edit","controlTypeId":50004,"automationId":"message-input","frameworkId":"Win32","className":"Chrome_WidgetWin_1","nativeWindowHandle":42,"inputKind":"text","currentValue":null},"provider":null,"transcript":{"rawText":"hello","finalText":"hello","characterCount":5},"insertion":{"status":"inserted","method":"send_input","errorCode":null,"errorMessage":null}}"#;

        let record: DictationRecordV1 = serde_json::from_str(payload).unwrap();

        assert_eq!(record.transcript.final_text, "hello");
        assert_eq!(record.timeline, None);
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
                        processed_audio: None,
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
                        timeline: None,
                    },
                )
                .unwrap();
        }

        let recent = store.list_recent(2, 0).unwrap();

        assert_eq!(recent.len(), 2);
        assert_eq!(recent[0].session_id, "session-2");
        assert_eq!(recent[1].session_id, "session-1");
    }

    #[test]
    fn loads_recent_records_with_offset() {
        let dir = temp_config_dir("dictation-record-history-offset");
        let settings = crate::storage::LocalSettingsStore::new(&dir);
        let store = LocalDictationRecordStore::new(&dir);

        for minute in 0..4 {
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
                        processed_audio: None,
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
                        timeline: None,
                    },
                )
                .unwrap();
        }

        let recent = store.list_recent(2, 1).unwrap();

        assert_eq!(recent.len(), 2);
        assert_eq!(recent[0].session_id, "session-2");
        assert_eq!(recent[1].session_id, "session-1");
    }

    #[test]
    fn imports_legacy_jsonl_records_into_sqlite_on_first_read() {
        let dir = temp_config_dir("dictation-record-history-legacy-jsonl");
        let store = LocalDictationRecordStore::new(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(dir.join("dictation-records.jsonl"))
            .unwrap()
            .write_all(
                br#"{"schemaVersion":1,"recordId":"a86f0b9f-0f5a-48e8-a24f-2851cb4be4df","userId":"3fd61656-c0e8-4b3c-b37f-18d85ed43499","installationId":"9d4f4d32-236d-4f12-b88e-b01eb0fdfca3","deviceId":"560fcc96-03a4-41da-8d2a-95f5db67e6c7","sessionId":"session-legacy","mode":"dictation","trigger":"hotkey","platform":"windows","capturedAt":"2026-05-02T08:30:00Z","startedAt":null,"endedAt":null,"target":{"stableId":"target-legacy","windowTitle":"Notes","controlName":"Message","controlType":"Edit","controlTypeId":50004,"automationId":"message-input","frameworkId":"Win32","className":"Chrome_WidgetWin_1","nativeWindowHandle":42,"inputKind":"text","currentValue":null},"provider":null,"transcript":{"rawText":"legacy","finalText":"legacy","characterCount":6},"insertion":{"status":"inserted","method":"send_input","errorCode":null,"errorMessage":null}}"#,
            )
            .unwrap();

        let recent = store.list_recent(1, 0).unwrap();

        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0].session_id, "session-legacy");
        assert_eq!(recent[0].transcript.final_text, "legacy");
        assert!(dir.join("dictation-records.sqlite").exists());
        assert!(dir.join("dictation-records.jsonl").exists());

        let repeated = store.list_recent(10, 0).unwrap();
        let conn = Connection::open(dir.join("dictation-records.sqlite")).unwrap();
        let row_count: usize = conn
            .query_row("SELECT COUNT(*) FROM dictation_records", [], |row| {
                row.get(0)
            })
            .unwrap();

        assert_eq!(repeated.len(), 1);
        assert_eq!(row_count, 1);
    }

    #[test]
    fn rejects_records_with_audio_artifacts_outside_recordings_scope() {
        let dir = temp_config_dir("dictation-record-unsafe-audio");
        let settings = crate::storage::LocalSettingsStore::new(&dir);
        let store = LocalDictationRecordStore::new(&dir);

        let err = store
            .save(
                &settings,
                DictationRecordDraftV1 {
                    session_id: Some("session-unsafe-audio".to_string()),
                    mode: "dictation".to_string(),
                    trigger: "hotkey".to_string(),
                    captured_at: "2026-05-02T08:30:00Z".to_string(),
                    started_at: None,
                    ended_at: None,
                    recording: None,
                    audio: Some(DictationAudioArtifact {
                        relative_path: "../outside.webm".to_string(),
                        mime_type: "audio/webm".to_string(),
                        byte_length: 12,
                    }),
                    processed_audio: None,
                    target: DictationTargetSnapshot {
                        stable_id: "target-unsafe-audio".to_string(),
                        window_title: "Notes".to_string(),
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
                        raw_text: "raw".to_string(),
                        final_text: "final".to_string(),
                        character_count: 5,
                    },
                    insertion: DictationInsertionOutcome {
                        status: "inserted".to_string(),
                        method: Some("send_input".to_string()),
                        error_code: None,
                        error_message: None,
                    },
                    timeline: None,
                },
            )
            .unwrap_err();

        assert_eq!(err.code, "invalid_provider_request");
        assert!(!dir.join("dictation-records.sqlite").exists());
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
    fn exports_recording_audio_into_vaak_downloads_directory() {
        let dir = temp_config_dir("dictation-record-export");
        let export_dir = temp_config_dir("dictation-record-export-target");
        let store = LocalDictationRecordStore::new(&dir);

        let saved = store
            .persist_audio(
                vec![1, 2, 3],
                "audio/webm".to_string(),
                "2026-05-02T08:30:00Z",
            )
            .unwrap();

        let exported = store
            .export_audio_to_dir(&saved.relative_path, &export_dir)
            .unwrap();

        assert!(exported.saved_path.contains("Vaak"));
        assert!(exported.saved_path.ends_with(".webm"));
        assert_eq!(
            fs::read(PathBuf::from(&exported.saved_path)).unwrap(),
            vec![1, 2, 3]
        );
    }

    #[test]
    fn rejects_audio_paths_outside_recordings_scope() {
        let dir = temp_config_dir("dictation-record-audio-path");
        let store = LocalDictationRecordStore::new(&dir);

        let err = store.load_audio("../outside.webm").unwrap_err();

        assert_eq!(err.code, "invalid_provider_request");
    }

    #[test]
    fn updates_existing_record_in_place_and_preserves_original_identity_fields() {
        let dir = temp_config_dir("dictation-record-update");
        let settings = crate::storage::LocalSettingsStore::new(&dir);
        let store = LocalDictationRecordStore::new(&dir);
        let original = store
            .save(
                &settings,
                failed_record_draft("session-update", "original raw"),
            )
            .unwrap();
        let other = store
            .save(&settings, failed_record_draft("session-other", "other raw"))
            .unwrap();

        let updated = store
            .update(
                &original.record_id,
                DictationRecordUpdateV1 {
                    recording: Some(DictationRecordingDiagnostics {
                        startup_ms: 42,
                        stream_acquisition_ms: 18,
                        reused_warm_stream: false,
                        analysis_ms: None,
                        transcription_ms: Some(900),
                        insertion_ms: None,
                        post_processing_ms: Some(940),
                    }),
                    processed_audio: Some(DictationAudioArtifact {
                        relative_path: "recordings/2026/05/02/retry.wav".to_string(),
                        mime_type: "audio/wav".to_string(),
                        byte_length: 4096,
                    }),
                    provider: Some(DictationProviderContext {
                        provider_id: "smallest".to_string(),
                        model_id: Some("pulse".to_string()),
                    }),
                    transcript: DictationTranscript {
                        raw_text: "recovered text".to_string(),
                        final_text: "recovered text".to_string(),
                        character_count: 14,
                    },
                    insertion: DictationInsertionOutcome {
                        status: "recovered".to_string(),
                        method: None,
                        error_code: None,
                        error_message: None,
                    },
                },
            )
            .unwrap();

        assert_eq!(updated.record_id, original.record_id);
        assert_eq!(updated.session_id, original.session_id);
        assert_eq!(updated.captured_at, original.captured_at);
        assert_eq!(updated.mode, original.mode);
        assert_eq!(updated.trigger, original.trigger);
        assert_eq!(updated.audio, original.audio);
        assert_eq!(updated.target, original.target);
        assert_eq!(updated.transcript.final_text, "recovered text");
        assert_eq!(updated.insertion.status, "recovered");

        let recent = store.list_recent(10, 0).unwrap();
        assert_eq!(recent.len(), 2);
        assert_eq!(recent[0].record_id, other.record_id);
        assert_eq!(recent[1].record_id, original.record_id);
        assert_eq!(recent[1].transcript.final_text, "recovered text");
    }

    #[test]
    fn updating_missing_record_returns_invalid_request() {
        let dir = temp_config_dir("dictation-record-update-missing");
        let store = LocalDictationRecordStore::new(&dir);

        let err = store
            .update(
                "missing-record",
                DictationRecordUpdateV1 {
                    recording: None,
                    processed_audio: None,
                    provider: None,
                    transcript: DictationTranscript {
                        raw_text: "recovered".to_string(),
                        final_text: "recovered".to_string(),
                        character_count: 9,
                    },
                    insertion: DictationInsertionOutcome {
                        status: "recovered".to_string(),
                        method: None,
                        error_code: None,
                        error_message: None,
                    },
                },
            )
            .unwrap_err();

        assert_eq!(err.code, "invalid_provider_request");
        assert!(err.message.contains("dictation record not found"));
    }

    #[test]
    fn rejects_newer_unsupported_sqlite_schema_version() {
        let dir = temp_config_dir("dictation-record-newer-schema");
        fs::create_dir_all(&dir).unwrap();
        let conn = Connection::open(dir.join("dictation-records.sqlite")).unwrap();
        conn.pragma_update(None, "user_version", LOCAL_SQLITE_SCHEMA_VERSION + 1)
            .unwrap();
        drop(conn);

        let err = LocalDictationRecordStore::new(&dir)
            .list_recent(1, 0)
            .unwrap_err();

        assert_eq!(err.code, "settings_store_failed");
        assert!(err.message.contains("newer than supported version"));
    }

    #[test]
    fn rejects_updated_processed_audio_paths_outside_recordings_scope() {
        let dir = temp_config_dir("dictation-record-update-unsafe-audio");
        let settings = crate::storage::LocalSettingsStore::new(&dir);
        let store = LocalDictationRecordStore::new(&dir);
        let original = store
            .save(
                &settings,
                failed_record_draft("session-unsafe-update", "raw"),
            )
            .unwrap();

        let err = store
            .update(
                &original.record_id,
                DictationRecordUpdateV1 {
                    recording: None,
                    processed_audio: Some(DictationAudioArtifact {
                        relative_path: "../outside.wav".to_string(),
                        mime_type: "audio/wav".to_string(),
                        byte_length: 4096,
                    }),
                    provider: None,
                    transcript: DictationTranscript {
                        raw_text: "recovered".to_string(),
                        final_text: "recovered".to_string(),
                        character_count: 9,
                    },
                    insertion: DictationInsertionOutcome {
                        status: "recovered".to_string(),
                        method: None,
                        error_code: None,
                        error_message: None,
                    },
                },
            )
            .unwrap_err();

        assert_eq!(err.code, "invalid_provider_request");
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

    fn failed_record_draft(session_id: &str, raw_text: &str) -> DictationRecordDraftV1 {
        DictationRecordDraftV1 {
            session_id: Some(session_id.to_string()),
            mode: "dictation".to_string(),
            trigger: "hotkey".to_string(),
            captured_at: "2026-05-02T08:30:00Z".to_string(),
            started_at: Some("2026-05-02T08:30:01Z".to_string()),
            ended_at: Some("2026-05-02T08:30:04Z".to_string()),
            recording: Some(DictationRecordingDiagnostics {
                startup_ms: 42,
                stream_acquisition_ms: 18,
                reused_warm_stream: false,
                analysis_ms: None,
                transcription_ms: None,
                insertion_ms: None,
                post_processing_ms: None,
            }),
            audio: Some(DictationAudioArtifact {
                relative_path: "recordings/2026/05/02/original.webm".to_string(),
                mime_type: "audio/webm".to_string(),
                byte_length: 2048,
            }),
            processed_audio: None,
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
                raw_text: raw_text.to_string(),
                final_text: String::new(),
                character_count: 0,
            },
            insertion: DictationInsertionOutcome {
                status: "failed".to_string(),
                method: None,
                error_code: Some("invalid_provider_response".to_string()),
                error_message: Some("provider returned an empty transcript".to_string()),
            },
            timeline: None,
        }
    }
}
