# Model Calling And Retry Base

This document is the baseline contract for model and provider calls in Vaak. It is provider-agnostic by design. Provider-specific behavior lives in [PROVIDER_SPECIFIC_RETRY.md](PROVIDER_SPECIFIC_RETRY.md).

Vaak should keep provider calls behind internal adapters. The dictation pipeline and UI should consume normalized results and normalized errors, not provider response shapes.

## Goals

- Keep local dictation usable without a Vaak account or hosted backend.
- Make provider failures visible and recoverable.
- Avoid duplicate activity records when a user retries a failed transcription.
- Keep retry behavior consistent across providers unless a provider requires a documented exception.
- Preserve privacy by logging only bounded, sanitized provider error summaries.

## Call Boundary

All speech provider adapters should normalize these inputs before making a network call:

- audio bytes
- audio MIME type
- optional language
- optional model
- optional prompt when the provider/model supports it

Adapters should return only the internal `TranscriptResult` shape:

```text
providerId
model
text
durationMs
```

Adapters should surface only `ProviderError` to callers. Raw provider response bodies must not be exposed to UI copy.

## Transport Retry Policy

Transport retry is for transient provider HTTP failures only.

Retryable:

- `429 Too Many Requests`
- `5xx` server errors

Not retryable:

- malformed local request data
- missing credentials or configuration
- `400 Bad Request`
- `401 Unauthorized`
- `403 Forbidden`
- provider responses that parse successfully but contain no transcript text
- provider responses with malformed or unsupported payloads

Current base behavior:

- maximum HTTP attempts: 2
- HTTP timeout: 30 seconds
- each attempt builds a fresh request
- prefer `Retry-After` when present and parseable as seconds
- default delay for `429`: 5 seconds
- default delay for `5xx`: 500 milliseconds

The shared retry helper accepts a request-builder function instead of a prebuilt request. This keeps multipart and streaming bodies safe because adapters recreate the body for each retry attempt instead of relying on request cloning.

## Normalized Error Codes

Provider code should use stable internal errors:

- `missing_provider_key`
- `missing_provider_config`
- `invalid_provider_request`
- `provider_bad_request`
- `provider_auth_failed`
- `provider_permission_failed`
- `provider_quota_exhausted`
- `provider_rate_limited`
- `provider_upstream_failed`
- `provider_request_failed`
- `invalid_provider_response`

Rate-limit errors should preserve `retryAfterMs` when the provider supplies usable retry timing.

## Response Logging

Provider logs may include:

- provider label
- HTTP status
- retry timing
- bounded response-body summary
- safe JSON fields such as `code`, `detail`, `error`, and `message`
- JSON object keys

Provider logs must not include:

- API keys
- full response bodies
- provider request IDs unless explicitly reviewed for privacy
- transcript text unless the user-facing workflow already stores it as dictation history
- target app field contents

## Activity Retry Semantics

User-triggered activity retry is not the same as transport retry.

Transport retry happens inside a provider call before the app reports success or failure.

Activity retry happens after a failed activity record already exists. Activity retry must update the original failed record in place, not append a new record.

When activity retry succeeds with non-empty transcript text:

- update the same `recordId`
- preserve `sessionId`
- preserve original `audio`
- preserve original `capturedAt`
- preserve original target snapshot
- preserve original mode and trigger
- set transcript fields from the recovered text
- update provider metadata from the retry result
- set insertion `status` to `recovered`
- clear old insertion error code and message

When activity retry returns an empty transcript after all allowed fallback attempts:

- update the same `recordId`
- set insertion `status` to `skipped`
- use a clear empty-transcript error code/message
- keep the row as a real no-op outcome, not a recovered transcript

When activity retry fails with a hard provider error:

- do not mutate the saved record
- show the retry error inline on the same failed row
- keep the Retry action available

## Storage Contract

The local JSONL history is append-only for first attempts and update-in-place for retry recovery.

`save_dictation_record` creates a new record.

`update_dictation_record` updates retry-owned fields on an existing record:

- `recording`
- `processedAudio`
- `provider`
- `transcript`
- `insertion`

It must not change:

- `recordId`
- `userId`
- `installationId`
- `deviceId`
- `sessionId`
- `mode`
- `trigger`
- `platform`
- `capturedAt`
- `startedAt`
- `endedAt`
- original `audio`
- target snapshot

Updated audio artifact paths must stay under `recordings/`.

## UI Contract

Activity feed status labels:

- `inserted`: successful insertion into the target
- `recovered`: retry recovered transcript text but did not insert automatically
- `skipped`: true empty/no-op outcome
- `failed`: provider, recording, focus, insertion, or storage failure

Retry controls should be visible only while the row is still `failed` and has usable saved audio plus provider metadata.

Polling and local merge logic must replace records with matching `recordId`. It must not show duplicate retry rows.

## Adding Or Changing Providers

Before adding a provider or changing model-call behavior:

1. Read this base contract.
2. Read [PROVIDER_SPECIFIC_RETRY.md](PROVIDER_SPECIFIC_RETRY.md).
3. Keep provider quirks inside the adapter.
4. Normalize errors before they reach the dictation pipeline.
5. Add tests for success, auth failure, rate limit, server failure, empty transcript, and malformed response.
6. Add activity retry tests if the change affects replay, fallback audio, or recovered-row behavior.
