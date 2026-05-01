# Onboarding Flow

## Purpose

Define the first-run experience for Vaak.

The onboarding flow should make the local product useful quickly while leaving
clear space for optional account, sync, and managed cloud features later. It
must not make login feel required for local dictation.

## Product Decision

Use a three-path model:

- Local setup
- Sign in for sync
- Managed Vaak

Only local setup is active for Milestone 1. The other paths can be visible as
future options, but they should not block the local product.

Avoid presenting "local models" as a primary choice until Vaak supports actual
local inference such as local Whisper, Ollama, or another on-device model path.
The current working path is a local desktop app with bring-your-own provider
keys.

## First-Run Decision Tree

```text
App launch
  |
  v
Load local settings
  |
  +-- provider configured
  |     + microphone ready
  |     + desktop runtime ready
  |       -> open main Voice screen
  |
  +-- missing provider, permission, or runtime setup
        -> open onboarding
```

Onboarding should be resumable. If the user closes the app halfway through,
the next launch should continue from the earliest incomplete required step.

## Mode Choice

The first onboarding screen asks how the user wants to use Vaak.

```text
Choose how to use Vaak
  |
  +-- Continue locally
  |     Active now
  |     No account required
  |     Bring your own provider key
  |     Settings stay on this device
  |
  +-- Sign in for sync
  |     Future
  |     Sync dictionary, snippets, styles, and non-secret settings
  |     Does not replace local mode
  |
  +-- Managed Vaak
        Future
        Use Vaak without setting up provider keys
        Requires account and subscription later
```

### Recommendation

Make `Continue locally` the primary action.

Render `Sign in for sync` and `Managed Vaak` as secondary unavailable paths
until the backend exists. Use copy such as `Coming later`, not fake disabled
controls that look broken.

## Active Local Setup Flow

```text
Welcome / mode choice
  -> Desktop readiness
  -> Provider setup
  -> Test provider
  -> Try dictation
  -> Finish
```

### Screen 1: Welcome And Mode Choice

Goal: establish that Vaak works without an account.

Primary copy:

```text
Use Vaak locally
Set up desktop dictation with your own provider key. No Vaak account required.
```

Primary action:

```text
Continue locally
```

Secondary future options:

```text
Sign in for sync
Keep dictionary, snippets, and preferences in sync later.

Managed Vaak
Use Vaak without provider setup when managed plans are available.
```

### Screen 2: Desktop Readiness

Goal: verify desktop capabilities before provider setup.

Checklist:

- Microphone access
- Desktop runtime
- Text insertion support
- Floating voice capsule

The screen should use the same structure on Windows, macOS, and Linux, but the
checklist details may change by platform.

Windows checklist details:

- Microphone permission
- Focus capture and text insertion support
- Hotkey monitor
- Floating capsule window

macOS checklist details:

- Microphone permission
- Accessibility permission
- Input monitoring permission if needed
- Floating capsule window

Linux checklist details:

- Microphone permission
- Desktop environment compatibility
- Text insertion support status
- Floating capsule window

### Screen 3: Provider Setup

Goal: configure the selected transcription provider.

Reuse the existing speech provider settings module:

```text
SpeechProviderSettings
  ProviderSelector
  OpenAiProviderPanel
  AzureOpenAiProviderPanel
```

Requirements:

- Show one active provider panel at a time.
- Never show stored API keys.
- Save provider setup atomically.
- Keep errors scoped to the selected provider.
- Allow empty API key only when a key is already saved.

### Screen 4: Test Provider

Goal: prove the provider is ready before the user tries dictation.

Milestone 1 behavior:

- Test saved key and required config.
- Show success inside the selected provider panel.
- Show provider-specific recovery errors inside the selected provider panel.

Later behavior:

- Run a tiny bundled audio transcription test.
- Show the transcript result.
- Keep the test sample local and deterministic.

### Screen 5: Try Dictation

Goal: let the user complete a real local loop.

Flow:

```text
Start recording
  -> speak one sentence
  -> stop recording
  -> transcribe with selected provider
  -> optionally insert into focused app
  -> finish onboarding
```

The user should be able to skip the live test if permissions or the current
desktop environment make insertion difficult.

## Main App After Onboarding

After onboarding is complete:

- Open the main Voice screen.
- Keep Settings accessible.
- Keep the floating capsule available when the desktop runtime supports it.
- Do not show Commands or Diagnostics as primary navigation until those
  features are production-ready.

## Platform Behavior

The screen sequence should not change by platform.

Only platform-specific readiness details should change. This keeps the product
consistent while still being honest about OS permission differences.

```text
Same flow:
  Mode choice
  Desktop readiness
  Provider setup
  Test provider
  Try dictation

Different details:
  permission names
  insertion capability status
  hotkey support
  troubleshooting copy
```

## Data And Persistence

Local onboarding state should live in the Rust local settings layer, not browser
localStorage.

Suggested non-secret fields:

```json
{
  "onboarding": {
    "completed": false,
    "mode": "local",
    "completedSteps": [
      "mode-choice",
      "desktop-readiness",
      "provider-setup"
    ]
  }
}
```

Secrets must remain in OS secure storage.

## Future Account Paths

### Sign In For Sync

This path should not change the local dictation architecture.

It should add:

- optional account
- sync for dictionary, snippets, style presets, and non-secret settings
- export and account deletion controls

It should not sync provider API keys unless a future encrypted secret-sync
design is explicitly approved.

### Managed Vaak

This path should add convenience for users who do not want provider setup.

It should require:

- account
- billing or managed trial state
- hosted transcription/rewrite routing
- usage limits and cost controls

It should not remove or degrade the local BYO provider path.

## Acceptance Criteria

- A first-time user sees local setup as the primary path.
- A user can complete onboarding without creating a Vaak account.
- A user can configure Azure OpenAI and test readiness during onboarding.
- A user can restart halfway through onboarding and continue from incomplete
  setup.
- Platform-specific permission copy appears only where relevant.
- Login and subscription paths are visible only as optional future paths until
  implemented.
- API keys are never stored in local JSON, browser storage, logs, or synced
  settings.

## Build Order

1. Add local onboarding state to `LocalSettingsStore`.
2. Add Tauri commands to read and update onboarding progress.
3. Add `OnboardingFlow` under `apps/desktop/src/features/onboarding`.
4. Add mode choice and desktop readiness screens.
5. Reuse `SpeechProviderSettings` for provider setup.
6. Add the try-dictation screen.
7. Gate app launch between onboarding and the normal app shell.
8. Add tests for first-run, resume, completed onboarding, and platform-specific
   readiness copy.
