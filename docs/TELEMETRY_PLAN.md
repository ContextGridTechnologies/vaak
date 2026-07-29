# Telemetry And Error Tracking Plan

This document defines how Vaak should use PostHog for product telemetry and
error visibility while preserving the local-first product promise.

## Goals

Vaak telemetry should answer product and reliability questions without
collecting user content.

Primary questions:

- Are users completing onboarding?
- Which provider setup paths are working or failing?
- Are dictation attempts succeeding, skipped, or failing?
- Which stage fails most often: recording, focus capture, transcription, or
  insertion?
- Are releases improving reliability?

Telemetry is not the source of truth for dictation history. Local dictation
records remain the detailed local-first activity log.

## Non-Goals

Do not use PostHog to collect:

- audio
- transcripts
- provider API keys
- authorization headers
- file paths
- focused-field contents
- full destination window titles
- raw provider responses
- full local dictation record payloads

Do not make PostHog or any cloud analytics service required for local dictation.

## Current Implementation

Current status:

- `posthog-js` is installed in the desktop app.
- Analytics initialization lives in `apps/desktop/src/lib/analytics/analytics.ts`.
- Browser wiring lives in `apps/desktop/src/lib/analytics/browser.ts`.
- App startup capture lives in `apps/desktop/src/app/TelemetryStartup.tsx`.
- Environment parsing supports `VITE_POSTHOG_PUBLIC_KEY` and
  `VITE_POSTHOG_HOST`.
- Usage analytics can be toggled in Settings.
- Crash reports can be toggled separately in Settings.
- Usage analytics and crash reports default to off until the user opts in.
- The Settings telemetry toggle now takes effect during the current app
  session.
- Analytics capture now sanitizes unsupported property values before sending
  events.
- Analytics string properties are redacted for common secret/token shapes and
  local Windows, macOS, and Linux paths, then capped before sending events.
- PostHog SDK calls are isolated so telemetry failures do not break local app
  behavior.

Current events emitted:

- `app_installed_or_first_run`
- `app_opened`
- `settings_opened`
- `setting_changed`
- `provider_configured`
- `provider_test_started`
- `provider_test_completed`
- `dictation_attempted`
- `onboarding_started`
- `onboarding_completed`
- `onboarding_failed`
- `dictation_started`
- `dictation_completed`
- `dictation_skipped`
- `dictation_failed`

Current privacy posture:

- Autocapture is disabled.
- Pageview and page-leave capture are disabled.
- Session recording is disabled.
- Dead-click, rage-click, heatmap, performance, exception, survey, and feature
  flag collection are disabled.
- Each event has an explicit property allowlist. Undeclared properties are
  dropped before the SDK receives them.
- Common SDK-added URL, referrer, browser, device, viewport, timezone, and
  session properties are denied.
- Raw handled-error messages stay local; PostHog receives stable error codes
  and stages only.
- GeoIP enrichment is disabled on every event and the PostHog project is
  configured to discard client IP data.
- Analytics are disabled when `VITE_POSTHOG_PUBLIC_KEY` is missing.
- Error diagnostics are limited to sanitized handled errors. Global exception
  capture, stack traces, and session replay are not enabled.

Current gaps:

- `onboarding_step_completed` is planned but not wired yet.
- Handled-error capture is wired for system setting saves, provider tests,
  onboarding, transcription, and insertion, but not yet for every recoverable
  error.
- There is no release/source-map workflow for production error debugging.

## Distribution And Identity

Vaak uses one PostHog project and one event schema for every build. The
`distribution_channel` property separates `github`, `microsoft_store`, and
local `development` builds.

PostHog's local anonymous ID is used before login. A future account session
must call `analytics.setAuthenticatedUserId(session.user.id)` with an opaque,
stable backend user ID after login, and call
`analytics.setAuthenticatedUserId(null)` on logout. Do not identify users by
email.

TODO(vaak-auth): wire those two calls when the login/session system is added.

## Privacy Rules

All telemetry must pass these rules before implementation:

1. Events must be optional and respect the local telemetry preference.
2. Events must not contain dictated content.
3. Events must not contain audio metadata that can identify content beyond safe
   technical characteristics such as duration buckets.
4. Events must not contain provider credentials or provider response bodies.
5. Events must use coarse target categories, not raw window titles or field
   values.
6. Error telemetry must prefer stable error codes over raw error messages.
7. Raw error messages must remain local.
8. The local app must remain fully usable when PostHog is disabled or blocked.
9. New event properties must be added to the central allowlist and documented
   here before they can be sent.

## Loophole Audit

The July 2026 review found and addressed these gaps:

| Gap | Risk | Resolution |
| --- | --- | --- |
| `dictation_started` fired only after recording stopped | Start, microphone, and focus failures were invisible | Added `dictation_attempted` at the manual/hotkey invocation boundary and stable early `dictation_failed` outcomes |
| `capture` accepted arbitrary scalar properties | A future caller could accidentally send transcript-like content | Added a per-event property allowlist before sanitization |
| Handled errors included redacted raw messages | Denylist redaction cannot prove all user/provider content is removed | Raw messages now remain local; only code, stage, handled status, and safe provider id are sent |
| PostHog SDK defaults added URLs and device metadata | More data was collected than needed for product decisions | Explicitly disabled unused SDK features and denied observed automatic properties |
| Project IP discard still allowed pre-discard GeoIP processing | Location properties could still be derived | Added `$geoip_disable` to every event and enabled project-level IP discard |
| Repeated failure paths could emit multiple early outcomes | Attempt-to-failure ratios could be inflated | The session records at most one early start failure per attempt |

Accepted constraints:

- PostHog keeps an anonymous distinct ID so attempts can be counted per install
  and used in funnels. It must not be replaced with an email address.
- A network service necessarily observes a connection source address in
  transit. Vaak disables GeoIP enrichment and PostHog storage of that address;
  eliminating all third-party network processing would require self-hosting or
  a first-party relay, which is not required now.

## Event Taxonomy

Use a small typed event set. Add fields only when they answer a known question.

### App Lifecycle

`app_installed_or_first_run`

- `app_env`
- `app_version`
- `platform`

`app_opened`

- `app_env`
- `app_version`
- `platform`

`app_version_seen`

- `app_env`
- `app_version`
- `platform`

### Onboarding

`onboarding_started`

- `entry_point`
- `app_version`

`onboarding_step_completed`

- `step_id`
- `mode`: `local` or `cloud_placeholder`

`onboarding_completed`

- `mode`: `local`
- `provider_id`
- `duration_bucket`

`onboarding_failed`

- `step_id`
- `error_code`
- `error_stage`

### Provider Setup

`provider_configured`

- `provider_id`
- `provider_family`
- `source`: `onboarding` or `settings`

`provider_test_started`

- `provider_id`
- `source`

`provider_test_completed`

- `provider_id`
- `status`: `success` or `failed`
- `duration_bucket`
- `error_code`

### Dictation

`dictation_attempted`

- `trigger`: `hotkey` or `manual`

`dictation_started`

- `trigger`: `hotkey` or `manual`
- `mode`: `dictation` or `command`
- `provider_id`: provider segmentation begins here, after settings resolve

`dictation_completed`

- `trigger`
- `provider_id`
- `model_id`
- `target_input_kind`
- `transcription_duration_bucket`
- `insertion_duration_bucket`
- `total_duration_bucket`
- `character_count_bucket`

`dictation_failed`

- `trigger`
- `provider_id`
- `target_input_kind`
- `error_stage`
- `error_code`
- `duration_bucket`

`dictation_skipped`

- `trigger`
- `provider_id`
- `target_input_kind`
- `skip_reason`
- `duration_bucket`

### Settings

`settings_opened`

- `section`

`setting_changed`

- `setting_id`
- `enabled`

Allowed setting ids should be stable names such as:

- `launch_on_startup`
- `usage_analytics`
- `speech_provider`
- `microphone_device`

## Error Taxonomy

Use explicit error stages:

- `recording`
- `capture_analysis`
- `focus`
- `transcription`
- `insertion`
- `storage`
- `settings`
- `provider_configuration`
- `app_runtime`

Use stable error codes where possible:

- `microphone_permission_denied`
- `microphone_unavailable`
- `speech_unclear`
- `no_speech`
- `transcription_failed`
- `provider_auth_failed`
- `provider_rate_limited`
- `provider_timeout`
- `focus_target_unavailable`
- `insertion_failed`
- `storage_write_failed`
- `settings_save_failed`
- `unknown_error`

## Error Tracking Strategy

Start with manual handled-error capture before enabling global exception
autocapture. Current implementation uses `analytics.captureError(...)` for
sanitized handled errors.

Recommended API shape:

```ts
analytics.captureError(error, {
  stage: "transcription",
  code: "provider_timeout",
  handled: true,
  providerId: "openai",
});
```

The analytics layer should:

- respect the current telemetry preference at call time
- map errors to stable codes
- keep raw error messages and stack traces local
- avoid throwing if PostHog is unavailable

Global exception autocapture should be considered only after:

- sanitization is centralized
- production source maps are handled
- the team agrees that stack traces are acceptable under the privacy policy
- users have a clear setting that governs error telemetry

## Duration And Size Buckets

Avoid sending exact timings unless needed. Prefer buckets:

- `lt_250ms`
- `250ms_1s`
- `1s_3s`
- `3s_10s`
- `10s_30s`
- `gte_30s`

Character count buckets:

- `0`
- `1_20`
- `21_100`
- `101_500`
- `501_2000`
- `gte_2001`

## Implementation Plan

### Phase 1: Consent And Analytics Foundation

Status: completed.

Goal: make the existing analytics layer correct before adding more events.

Tasks:

- Add a live telemetry state to the analytics wrapper.
- Make Settings changes call PostHog opt-in or opt-out immediately.
- Ensure `capture` checks the latest preference rather than a startup-only
  boolean.
- Add a typed property sanitizer.
- Add unit tests for enabled, disabled, and runtime toggle behavior.

Exit criteria:

- Turning analytics off stops events in the same app session.
- Turning analytics on resumes events without restarting.
- No event can include unsupported property value types.

### Phase 2: Product Event Wiring

Status: partially complete.

Goal: measure important product funnels without collecting content.

Tasks:

- Capture onboarding started/completed/failed events. Completed.
- Capture provider configured and provider test result events. Completed for
  settings and onboarding variants of the provider settings component.
- Capture settings opened and safe setting changed events. Completed for the
  Settings screen, usage analytics, and launch-on-startup toggles.
- Add tests for event emission and event suppression when telemetry is off.

Exit criteria:

- The onboarding and provider setup funnel is visible in PostHog.
- Settings changes emit only stable, non-sensitive property names.

### Phase 3: Dictation Reliability Events

Status: completed for invocation, early start failures, processing,
transcription, and insertion outcomes.

Goal: understand real dictation reliability by stage.

Tasks:

- Capture `dictation_attempted` at the manual/hotkey invocation boundary.
  Completed.
- Capture microphone-unavailable, recording-start, and missing-focus failures
  before processing. Completed.
- Capture `dictation_started` when processing begins. Completed.
- Capture `dictation_completed` after successful insertion. Completed.
- Capture `dictation_skipped` for no speech, unclear speech, and empty
  transcript skips. Completed.
- Capture `dictation_failed` for transcription and insertion failures.
  Completed.
- Include safe provider id, target input kind, stage, error code, and buckets.
  Completed.
- Reuse local dictation record fields where possible instead of duplicating
  logic.

Exit criteria:

- Success, skip, and failure rates can be queried by provider and stage.
- No transcript, audio, focused-field value, or raw window title is sent.

### Phase 4: Handled Error Capture

Status: partially complete.

Goal: add safe error visibility for recoverable failures.

Tasks:

- Add `captureError` to the analytics wrapper. Completed.
- Add redaction and message length caps. Completed.
- Map common Tauri/provider/UI errors to stable codes. Partially complete.
- Capture handled errors in settings saves, provider tests, dictation loop
  failures, and local record load failures. Partially complete for settings
  saves and provider tests.
- Add tests for redaction and disabled telemetry behavior. Completed for the
  analytics wrapper and current settings/provider failure wiring.

Exit criteria:

- Recoverable errors appear as sanitized telemetry.
- Raw sensitive values are not sent.
- Error capture never breaks the user flow.

### Phase 5: Production Error Tracking

Goal: decide whether to enable richer PostHog error tracking.

Tasks:

- Decide whether stack traces are allowed under the privacy policy.
- Configure production source-map upload if stack traces are enabled.
- Consider global `window.onerror` and `unhandledrejection` handling.
- Keep session replay disabled unless a separate privacy review approves it.

Exit criteria:

- Production exceptions are debuggable without exposing user content.
- Release versions are visible in error reports.

## Dashboard Plan

Initial PostHog views:

- Onboarding completion funnel.
- Provider setup success by provider.
- Dictation outcome trend: completed, skipped, failed.
- Dictation failure breakdown by stage.
- Provider latency bucket trends.
- Release comparison by app version.

## Documentation Updates

When implementation begins, update:

- `docs/DEVELOPMENT.md` with telemetry environment setup.
- `docs/SECURITY.md` with final telemetry privacy rules.
- Settings UI copy if the scope expands from usage analytics to error tracking.

## Validation Status And Next Step

Validated in PostHog Live Events on 2026-07-29:

- the consented local flow emitted `dictation_attempted`, `dictation_started`,
  and `dictation_completed`
- a fresh event contained `distribution_channel=development`
- a live inspection exposed PostHog's automatic session-entry URL properties;
  those properties are now denied and a fresh event verified that URL, host,
  path, and referrer values are absent
- production and development Tauri CSPs now allow the documented US and EU
  PostHog ingestion hosts

The remaining release check is to install the next GitHub and Microsoft Store
artifacts and verify that each reports its matching `distribution_channel`.
Do not add `onboarding_step_completed` until a dashboard question requires it.
