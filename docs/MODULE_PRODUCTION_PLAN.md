# Vaak Module Production Plan

This document divides the current Vaak codebase into production modules and
sets the order for hardening them. It complements `docs/ROADMAP.md`,
`docs/ARCHITECTURE.md`, and `docs/PROJECT_STRUCTURE.md`; those documents remain
the source of truth for product direction, architecture, and repository layout.

The current engineering focus is still Milestone 1: Local BYOM Dictation
Foundation. The phases below are an execution map for bringing each module to a
production standard without making cloud auth or a hosted backend a dependency.

## Production Principles

- Keep local dictation usable without login.
- Keep provider-specific code behind stable provider boundaries.
- Store BYO provider keys only through secure storage helpers.
- Expose recoverable errors clearly instead of hiding failures.
- Prefer reusable feature modules and shared components over one-off UI.
- Keep visible app navigation limited to `Voice` and `Settings` until other
  sections are real.
- Treat generated screenshots, scratchpads, and debug output as local-only.

## Current Application Modules

### 1. App Shell And Navigation

Primary paths:

- `apps/desktop/src/app/`
- `apps/desktop/src/components/app/`
- `apps/desktop/src/components/ui/`
- `apps/desktop/src/styles/`
- `apps/desktop/src-tauri/src/windowing.rs`

Responsibilities:

- Desktop app frame, title bar, layout, navigation, theme, providers, update
  notification, and shared UI primitives.
- Main window behavior, tray behavior, single-instance reopen, and floating
  voice capsule window placement.

Production target:

- The app opens into a dense workflow surface, not a marketing page.
- Window, tray, title bar, theme, and layout states are stable across browser
  preview and Tauri runtime.
- Hidden or future sections do not leak into primary navigation.

### 2. Onboarding And Readiness

Primary paths:

- `apps/desktop/src/features/onboarding/`
- `apps/desktop/designs/onboarding/`
- `apps/desktop/src/lib/tauri/onboarding.ts`
- `apps/desktop/src-tauri/src/storage/local_settings.rs`

Responsibilities:

- First-run mode choice, microphone readiness, provider setup, provider test,
  hotkey readiness, and completion state.

Production target:

- A new user can choose local mode, grant microphone access, configure a BYO
  provider, verify readiness, and reach the main app without a Vaak account.
- Onboarding state survives restarts and migrates older step names safely.

### 3. Audio Capture And Microphone Control

Primary paths:

- `apps/desktop/src/hooks/useAudioRecorder.ts`
- `apps/desktop/src/hooks/audioProcessing.ts`
- `apps/desktop/src/hooks/useAudioDevices.ts`
- `apps/desktop/src/hooks/useMicrophoneSelection.ts`
- `apps/desktop/public/audioCaptureProcessor.js`
- `apps/desktop/src/hooks/audioCaptureProcessor.js`

Responsibilities:

- Device enumeration, permission requests, selected microphone persistence,
  recording lifecycle, audio-level feedback, capture analysis, and processed
  transcription segments.

Production target:

- Recording starts reliably with the selected microphone or the OS default.
- Failure states are understandable and recoverable.
- Audio processing improves dictation quality without causing silent data loss.

### 4. Dictation Orchestration

Primary paths:

- `apps/desktop/src/features/dictation/`
- `apps/desktop/src/features/floating/`
- `apps/desktop/src/features/home/`
- `apps/desktop/src/lib/tauri/dictation-records.ts`

Responsibilities:

- Manual and hotkey dictation session flow, focus capture coordination,
  transcription dispatch, insertion dispatch, record persistence, floating voice
  control, and local activity history.

Production target:

- The loop clearly moves through recording, transcription, insertion, inserted,
  skipped, and failed states.
- The raw transcript and local record survive recoverable provider or insertion
  failures.
- The activity feed reflects local captures accurately without exposing debug
  internals in production UI.

### 5. Provider Settings And Speech Adapters

Primary paths:

- `apps/desktop/src/features/providers/`
- `apps/desktop/src/features/settings/speech-provider/`
- `apps/desktop/src/lib/tauri/providers.ts`
- `apps/desktop/src-tauri/src/providers/`
- `apps/desktop/src-tauri/src/providers/speech/`

Responsibilities:

- Provider catalog, provider setup UI, status checks, API key persistence,
  provider config persistence, transcription request normalization, and speech
  provider adapters.

Production target:

- OpenAI, Deepgram, and Groq are the initial strategic targets, while currently
  implemented adapters remain coherent behind one provider interface.
- Provider errors identify missing credentials, missing configuration,
  unsupported providers, invalid request data, and upstream failures.
- Provider-specific response formats are normalized before entering the
  dictation pipeline.

Current implementation note:

- Speech adapters currently include OpenAI, Azure OpenAI, AssemblyAI, Deepgram,
  ElevenLabs, and Smallest AI. Gemini is recognized but unsupported for
  transcription. Groq is a strategic target and should be added behind the same
  boundary when implemented.

### 6. Native Focus, Hotkeys, And Text Insertion

Primary paths:

- `apps/desktop/src-tauri/src/platform/`
- `apps/desktop/src-tauri/src/platform/windows/`
- `apps/desktop/src-tauri/src/session.rs`
- `apps/desktop/src-tauri/src/commands/mod.rs`
- `apps/desktop/src/lib/tauri/focus.ts`

Responsibilities:

- Focused-field detection, captured target storage, global hotkey handling,
  guarded insertion into the original target, and platform-specific errors.

Production target:

- Dictation inserts into the intended focused desktop app, not just the Vaak
  window.
- Hotkey start and stop behavior is reliable and does not leave stale targets.
- Platform failures are explicit enough for UI recovery and diagnostics.

### 7. Local Storage, Identity, And Activity Records

Primary paths:

- `apps/desktop/src-tauri/src/storage/`
- `packages/shared/contracts/`
- `apps/desktop/src/lib/tauri/dictation-records.ts`

Responsibilities:

- Non-secret settings, provider configs, microphone selection, hotkeys,
  onboarding state, app shell preferences, local identity, dictation records,
  original audio artifacts, and optional debug audio artifacts.

Production target:

- Settings and records use versioned, typed structures.
- Provider secrets never appear in plain settings files.
- Activity history can be listed, paginated, and loaded without corrupting local
  data.

### 8. Settings Surface

Primary paths:

- `apps/desktop/src/features/settings/`
- `apps/desktop/src/lib/tauri/system-settings.ts`
- `apps/desktop/src/lib/tauri/app-shell.ts`

Responsibilities:

- Speech provider settings, microphone selection, keyboard shortcut settings,
  launch-on-startup preference, and other local app preferences.

Production target:

- Settings are grouped by operational task.
- Each setting has an immediate, visible result or a clear saved/error state.
- Local settings work without sync or account features.

### 9. Diagnostics And Developer Visibility

Primary paths:

- `apps/desktop/src/features/diagnostics/`
- `apps/desktop/src/lib/analytics/`
- `docs/TELEMETRY_PLAN.md`
- `docs/DATA_CAPTURE_SCHEMA.md`
- `output/`

Responsibilities:

- Debug views, local diagnostics, privacy-aware analytics boundaries, data
  capture schema, and generated local artifacts.

Production target:

- Diagnostics help development and support without becoming primary product UI.
- Debug-only audio artifacts and implementation internals stay hidden in normal
  production flows.
- Telemetry remains opt-in or clearly controlled according to the project docs.

### 10. Optional Account, Sync, And Cloud

Primary paths:

- `apps/desktop/src/features/account/`
- future `services/api/`
- future shared sync contracts under `packages/shared/`

Responsibilities:

- Optional account placeholder today; future auth, sync, managed usage,
  billing, and team controls.

Production target:

- Local users remain unaffected.
- Cloud work begins only after the local product loop is strong enough to stand
  alone.
- Sync never becomes a dependency for local dictation.

## Production Hardening Phases

### Phase 0: Baseline Map And Guardrails

Goal:

- Confirm module ownership, current behavior, public docs, local-only artifacts,
  and verification commands.

Exit criteria:

- The module map is documented.
- Each future change can be assigned to one primary module and any affected
  dependency modules.
- The dirty worktree is understood before staging or committing.

### Phase 1: Local Dictation Loop Closeout

Primary modules:

- Audio Capture And Microphone Control
- Dictation Orchestration
- Native Focus, Hotkeys, And Text Insertion
- Local Storage, Identity, And Activity Records

Scope:

- Make the current recording -> transcription -> insertion -> local activity
  loop reliable enough for broader Windows testing.
- Preserve recoverable user data, especially raw transcript and audio record
  metadata.
- Tighten state transitions and error mapping across recording, focus,
  provider, insertion, and persistence failures.

Exit criteria:

- A user can complete local onboarding, dictate into another Windows app, and
  see a durable local activity record without login.
- Failures are visible and actionable.
- `npm run typecheck`, `npm --prefix apps/desktop run lint`, `npm run test`,
  and `npm run build` pass for relevant changes.
- Rust changes also pass `cargo check` from `apps/desktop/src-tauri`.

### Phase 2: Provider Boundary And Model Quality

Primary modules:

- Provider Settings And Speech Adapters
- Settings Surface
- Dictation Orchestration

Scope:

- Align implemented providers with the strategic provider list.
- Add or finish missing adapter work behind the internal provider interface.
- Add transcript cleanup/rewrite as a separate provider-backed stage without
  breaking direct transcript insertion.
- Improve provider setup, status, and error recovery.

Exit criteria:

- Provider-specific code remains isolated.
- Users can choose a provider, save required config, test readiness, and
  understand failures.
- Dictation supports a clear path for direct transcript insertion and a future
  polished rewrite path.

### Phase 3: UX Production Pass

Primary modules:

- App Shell And Navigation
- Onboarding And Readiness
- Settings Surface
- Dictation Orchestration
- Diagnostics And Developer Visibility

Scope:

- Refine first-run flow, empty states, activity history, settings density,
  error copy, loading states, and responsive behavior.
- Keep recorder internals hidden and move capture UX toward the floating voice
  control.
- Keep `Commands` and `Diagnostics` hidden from primary navigation until their
  product surface is real.

Exit criteria:

- The first screen feels like a production desktop tool.
- Important UI changes are checked with desktop and mobile-sized screenshots
  when practical.
- Browser preview mode and Tauri runtime both expose understandable states.

### Phase 4: Reliability, Security, And Packaging

Primary modules:

- Native Focus, Hotkeys, And Text Insertion
- Local Storage, Identity, And Activity Records
- Provider Settings And Speech Adapters
- App Shell And Navigation

Scope:

- Harden Windows target-app coverage, secure credential handling, local data
  integrity, installer behavior, update notification, logging, and release
  checks.

Exit criteria:

- BYO provider keys never land in plain local settings.
- Local files are versioned or migratable.
- Windows packaging is clear enough for developer testing.
- Release docs are aligned with current behavior and limitations.

### Phase 5: Personalization

Primary modules:

- future `apps/desktop/src/features/personalization/`
- Provider Settings And Speech Adapters
- Local Storage, Identity, And Activity Records
- Settings Surface

Scope:

- Add personal dictionary, snippets, style presets, import/export, and
  app-aware prompt context where available.

Exit criteria:

- Local personalization changes dictation output in predictable ways.
- Personalization data remains local unless the user later opts into sync.

### Phase 6: Optional Sync And Managed Cloud

Primary modules:

- Optional Account, Sync, And Cloud
- Local Storage, Identity, And Activity Records
- Provider Settings And Speech Adapters
- future backend services

Scope:

- Add optional account, sync, managed provider usage, billing, and team
  foundations after the local desktop product is credible.

Exit criteria:

- Local-only users can ignore account and cloud features.
- Signed-in users get clear value from sync or managed usage.
- Managed usage is metered and bounded.

## Module Review Template

Use this checklist when hardening a module:

1. Define the module's public boundary.
2. List user-visible states and failure states.
3. Check whether data crosses a trust boundary.
4. Confirm typed contracts exist for cross-module calls.
5. Confirm provider, Tauri, browser, and storage errors are normalized.
6. Move reusable UI to shared components when more than one feature needs it.
7. Add focused tests for the riskiest behavior.
8. Run the smallest meaningful verification command.
9. Capture screenshots for important UI changes when practical.
10. Update public docs only when behavior, architecture, or product direction
    changes.

## Suggested Work Order

1. Start with Phase 1 because it is the product-critical path.
2. Review one module at a time and keep changes scoped to that module.
3. Treat cross-module changes as explicit dependencies, not incidental cleanup.
4. Keep task-level notes local unless they become durable architecture or
   product guidance.
5. Revisit this document after each milestone closeout so it stays aligned with
   the real codebase.
