# Data Capture Schema

This document defines the storage contract for captured dictation activity, the
local SQLite storage shape, and the normalized Postgres tables that should store
synced or cloud-backed activity later.

## Recommendation

Use one canonical JSON payload everywhere and store it in both places:

- Local desktop: persist one `DictationRecordV1` object per completed attempt.
- Backend: accept the same `DictationRecordV1` payload and store a full copy in `payload jsonb`.

Do not make the local file format and the Postgres table shape identical. The payload should be identical; the storage layout should be optimized for each environment.

Best path:

1. Generate stable local UUIDs on first run and keep them in local settings.
2. Emit one `DictationRecordV1` per dictation attempt.
3. Save the exact JSON payload locally.
4. Send the exact same JSON payload to the backend when sync or cloud capture exists.
5. In Postgres, store indexed columns for common queries and keep the full JSON payload for compatibility.

Current desktop implementation:

- Local identity is persisted in `settings.json`.
- Dictation activity history is stored in `dictation-records.sqlite`.
- Existing `dictation-records.jsonl` files from pre-SQLite builds are imported
  into SQLite on first activity-store access, and the original JSONL file is
  left in place.
- Keep local identity, onboarding state, hotkeys, microphone selection, provider
  configuration, and non-secret app preferences in `settings.json`.
- Keep original captured audio and processed audio artifacts as scoped files
  under `recordings/...`; SQLite stores only references and metadata.
- Keep provider secrets out of SQLite. API keys must continue to use secure
  storage.
- Store the full canonical `DictationRecordV1` payload in SQLite alongside
  queryable columns for recent activity, retry, diagnostics, and future sync.

## Stable Local Identity

Local installs do not start with an account-backed user id, so Vaak should mint and persist:

- `userId`: stable UUID for this logical local user
- `installationId`: stable UUID for this app installation
- `deviceId`: stable UUID for this device identity within Vaak

These ids are now represented by the shared `LocalIdentity` contract in:

- [packages/shared/contracts/local-identity.v1.schema.json](/C:/Users/nikhi/Desktop/Projects/vaak/packages/shared/contracts/local-identity.v1.schema.json)

When an authenticated backend exists later, the best approach is to keep the same `userId` as Vaak's internal primary key and attach external auth identifiers to that row instead of rewriting historical records.

## Canonical Record Format

The shared payload contract is:

- [packages/shared/contracts/dictation-record.v1.schema.json](/C:/Users/nikhi/Desktop/Projects/vaak/packages/shared/contracts/dictation-record.v1.schema.json)

Core sections:

- Identity: `recordId`, `userId`, `installationId`, `deviceId`, `sessionId`
- Triggering: `mode`, `trigger`, `platform`
- Timing: `capturedAt`, `startedAt`, `endedAt`
- Recording diagnostics: startup, stream acquisition, local analysis, transcription, insertion, and post-processing timings when available
- Audio artifacts: original captured audio, plus development-only processed audio when enabled
- Target snapshot: window/control metadata plus `inputKind`
- Provider metadata: `providerId`, `modelId`
- Transcript payload: `rawText`, `finalText`, `characterCount`
- Insertion result: `status`, `method`, `errorCode`, `errorMessage`

Capture-analysis outcomes are reflected through the insertion result:

- `status: "skipped"` with `errorCode: "speech_unclear"` means the attempt was intentionally not inserted.
- `status: "recovered"` means activity retry recovered transcript text but did not automatically insert it into the original target.
- `errorMessage: "No speech detected."` is used for true silence/no-speech skips.
- Low-confidence captures with a meaningful signal peak can still be sent to the provider as the original raw audio. If that provider call succeeds, the final record is an inserted or empty-transcript record rather than a local capture skip.

Activity retry updates the original `DictationRecordV1` in place through `update_dictation_record`. It should not create a second record for the retry. The update preserves the original identity, timing, trigger, mode, target, and original audio fields while replacing retry-owned transcript, provider, processed-audio, recording diagnostics, and insertion outcome fields.

Recommended privacy default:

- Keep `target.currentValue` as `null` unless the user explicitly enables a debug or audit mode.
- The field can contain highly sensitive text from the destination app, so it should not be captured by default.

## Local SQLite Activity Store

The local SQLite database is a desktop implementation detail for dictation
activity. It should preserve the same canonical record payload used by the
backend contract while making local listing, retry, diagnostics, and future sync
straightforward.

The initial SQLite scope is intentionally narrow:

- Replace only dictation activity persistence.
- Keep the public Rust store API stable where practical:
  `save`, `list_recent`, `update`, `persist_audio`, `load_audio`, and
  `export_audio_to_dir`.
- Leave settings JSON and secure credential storage unchanged.
- Leave audio persistence on the filesystem.
- Do not implement backend sync, search, or import/export in the same change.

Database file:

- `dictation-records.sqlite`
- stored in the same app config directory that currently holds
  `settings.json` and `dictation-records.jsonl`

Dependency policy:

- Use `rusqlite` with bundled SQLite for the desktop backend so Windows users do
  not need a separate system SQLite installation.
- Keep SQLite behind the existing dictation record storage boundary instead of
  exposing database details to frontend commands.

Connection policy:

- Open SQLite connections through one storage helper.
- Ensure schema exists before every operation that touches the activity store.
- Enable production-safe pragmas on every connection:
  - `PRAGMA journal_mode = WAL`
  - `PRAGMA foreign_keys = ON`
  - `PRAGMA busy_timeout = 5000`
- Surface open, migration, read, write, and corruption failures as storage
  errors. Do not silently reset or delete the database.

Timestamp policy:

- Persist timestamps as UTC ISO-8601 strings, for example
  `2026-06-12T10:20:30.123Z`.
- `captured_at` comes from the canonical record.
- `created_at` is set on insert.
- `updated_at` changes when activity retry updates the record.
- `created_at` and `updated_at` are local SQLite metadata. They are not part
  of `DictationRecordV1` unless the shared contract intentionally adds those
  fields in a future schema version.

Migration policy:

- Version `1` creates the initial local SQLite schema, including timing/chart
  columns, normalized provider request projections, projection integrity
  indexes, and chart-focused indexes.
- Record applied migrations in `schema_migrations`.
- Set SQLite `PRAGMA user_version` to the latest applied schema version after a
  successful migration.
- Check `PRAGMA user_version` before normal reads and writes. If the database
  schema is newer than the running app supports, return a clear storage error
  instead of trying to read it.
- Run each migration inside a transaction. Insert into `schema_migrations` and
  update `PRAGMA user_version` only after the migration body succeeds.
- Future migrations must be additive where possible and must not rewrite
  `payload_json` unless the canonical contract version changes.
- Failed migrations should return a storage error and leave the existing
  database file in place for inspection or backup.
- App downgrades are not supported automatically. A downgraded app should fail
  closed when it sees a newer local schema version.

Recommended local schema:

```sql
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

CREATE INDEX IF NOT EXISTS idx_dictation_records_captured_at
  ON dictation_records(captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_dictation_records_session_id
  ON dictation_records(session_id);

CREATE INDEX IF NOT EXISTS idx_dictation_records_status
  ON dictation_records(status, captured_at DESC);

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
```

The indexed columns are derived from `DictationRecordV1`. `payload_json` remains
the source of truth for reconstructing the full record returned to the
frontend. `dictation_provider_requests` is a query-optimized projection of
`timeline.providerRequests[]`; it is rebuilt from the same payload during local
record writes and future local migrations.

Timing capture:

- `DictationRecordV1.timeline` is optional and backward compatible within
  schema version `1`.
- Timeline timestamps use UTC ISO 8601 strings for recording start/stop,
  processing start, audio analysis completion, transcription start/complete,
  provider request send/receive, insertion start/complete, and record
  persistence.
- Segmented transcription stores `timeline.providerRequests[]` entries with
  `segmentIndex`, `startedAt`, `completedAt`, `providerId`, `modelId`, and
  optional per-request `status`/`errorCode`. Valid request statuses are
  `succeeded` and `failed`.
- SQLite timing columns are chart-friendly derivatives only. The canonical
  timeline remains in `payload_json`.
- `provider_roundtrip_ms` is the wall-clock span from the first provider
  request start to the last provider response. `provider_total_roundtrip_ms`
  sums normalized request durations, and `provider_max_roundtrip_ms` stores the
  slowest single request duration.

Contract parity rule:

- Before the SQLite switch, confirm the Rust `DictationRecordV1` shape and
  [packages/shared/contracts/dictation-record.v1.schema.json](/C:/Users/nikhi/Desktop/Projects/vaak/packages/shared/contracts/dictation-record.v1.schema.json)
  describe the same payload, including optional recording diagnostics.
- Do not use the SQLite change to silently add public payload fields.

Column consistency rules:

- Insert and update paths must derive SQL columns and `payload_json` from the
  same in-memory `DictationRecordV1` value immediately before writing.
- Do not manually patch derived columns separately from `payload_json`.
- If deserializing `payload_json` fails, return a storage error instead of
  reconstructing records from derived columns.
- Future backend sync must read the canonical `DictationRecordV1` payload, not
  depend on the local SQLite column layout.

Activity retry rules stay unchanged:

- Retry updates the existing row by `record_id`.
- Retry must preserve the original identity, timing, trigger, mode, target, and
  original audio fields.
- Retry may replace retry-owned recording diagnostics, processed audio,
  provider metadata, transcript fields, insertion outcome, and `payload_json`.
- Retry updates the local SQLite `updated_at` metadata column.

Listing rules:

- `list_recent(limit, offset)` orders by `captured_at DESC`, then
  `created_at DESC`, then `record_id DESC` for deterministic ties.
- Clamp `limit` to a small upper bound, such as `100`, to avoid accidental large
  reads from UI bugs.
- Deserialize `payload_json` into `DictationRecordV1` before returning records
  to the frontend.

Implementation sequence:

1. Add focused storage tests that describe SQLite creation, newest-first
   listing, update-in-place retry, missing-record retry errors, legacy JSONL
   import, newer schema version checks, contract parity, deterministic ordering
   ties, and unchanged audio behavior.
2. Add the bundled SQLite dependency to the Tauri backend.
3. Replace only the dictation activity record persistence internals with SQLite.
4. Keep the existing storage API and frontend command behavior stable.
5. Run focused Rust storage tests, then `cargo check` from
   `apps/desktop/src-tauri`.

Public release note:

- The SQLite implementation imports existing JSONL history into the local
  SQLite activity store so pre-SQLite local activity remains visible.
- The import is idempotent and preserves the original JSONL file for backup or
  inspection.

Implementation success criteria:

1. Saving a dictation record creates or reuses `dictation-records.sqlite` and
   inserts one row with a valid canonical `payload_json`.
2. Recent activity returns records in newest-first order with offset support.
3. Activity retry updates the original row in place and preserves original
   immutable fields.
4. Missing-record retry returns the existing recoverable invalid-request error.
5. Audio save, load, and export behavior remains filesystem-backed and
   unchanged.
6. Unsafe audio artifact paths are still rejected before a record is inserted or
   updated.
7. Existing `dictation-records.jsonl` is imported into SQLite without being
   modified or deleted.
8. `cargo check` and focused storage tests pass on Windows without requiring a
   system SQLite installation.
9. A database with a newer unsupported schema version returns a clear storage
   error rather than being read or modified.
10. The Rust `DictationRecordV1` and shared JSON schema remain aligned before
    SQLite records are treated as the canonical local activity payload.
11. Schema version `1` databases expose nullable timeline columns, normalized
    provider request rows, integrity indexes, and chart indexes while old
    payloads without `timeline` still deserialize.

## Postgres Tables

```sql
create extension if not exists pgcrypto;

create table app_users (
  id uuid primary key,
  identity_scope text not null check (identity_scope in ('local', 'account')),
  external_auth_user_id text,
  primary_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index app_users_external_auth_idx
  on app_users (external_auth_user_id)
  where external_auth_user_id is not null;

create table user_installations (
  id uuid primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  device_id uuid not null,
  platform text not null,
  device_label text,
  app_version text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, device_id)
);

create table dictation_records (
  id uuid primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  installation_id uuid not null references user_installations(id) on delete cascade,
  device_id uuid not null,
  session_id uuid not null,
  mode text not null check (mode in ('dictation', 'command')),
  trigger text not null check (trigger in ('hotkey', 'manual', 'api')),
  platform text not null,
  provider_id text,
  model_id text,
  target_stable_id text not null,
  target_window_title text,
  target_control_name text,
  target_control_type text not null,
  target_control_type_id integer not null,
  target_automation_id text,
  target_framework_id text,
  target_class_name text,
  target_native_window_handle bigint,
  target_input_kind text not null,
  transcript_raw_text text not null,
  transcript_final_text text not null,
  transcript_character_count integer not null check (transcript_character_count >= 0),
  insertion_status text not null check (insertion_status in ('inserted', 'recovered', 'skipped', 'failed')),
  insertion_method text,
  error_code text,
  error_message text,
  captured_at timestamptz not null,
  started_at timestamptz,
  ended_at timestamptz,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index dictation_records_user_captured_idx
  on dictation_records (user_id, captured_at desc);

create index dictation_records_installation_captured_idx
  on dictation_records (installation_id, captured_at desc);

create index dictation_records_target_idx
  on dictation_records (user_id, target_stable_id, captured_at desc);

create index dictation_records_status_idx
  on dictation_records (user_id, insertion_status, captured_at desc);

create index dictation_records_payload_gin_idx
  on dictation_records using gin (payload jsonb_path_ops);
```

## Example Record

```json
{
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
}
```

## Why This Is The Best Fit

- It preserves local-first behavior because local UUIDs exist without an account.
- It keeps sync simple because the desktop payload already matches the backend payload.
- It keeps Postgres queryable without forcing every future field into a migration.
- It avoids storing sensitive pre-existing field text unless explicitly enabled.
- It fits Vaak's current focus capture model because the target block directly reuses focused-field metadata.
