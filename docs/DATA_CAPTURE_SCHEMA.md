# Data Capture Schema

This document defines the storage contract for captured dictation activity and the normalized Postgres tables that should store it.

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
- Dictation history is appended as one JSON object per line in `dictation-records.jsonl`.
- The line payload already matches the canonical backend record shape.

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
