# Vaak Architecture

## Target Shape

Vaak is a local-first desktop app with optional cloud services.

The core app pipeline is:

```text
hotkey/button
  -> capture focused field
  -> record audio
  -> transcribe audio
  -> rewrite transcript
  -> insert final text
```

The first complete product loop must run without login.

## Layers

### UI Layer

React/TypeScript owns:

- dictation controls
- provider settings
- local personalization UI
- status and error states
- onboarding and permissions UI

### Provider Layer

Provider clients own:

- transcription API calls
- rewrite/model API calls
- response normalization
- provider-specific errors

All providers should implement stable internal interfaces so users and
contributors can add more provider integrations without changing the dictation
pipeline.

### Storage Layer

Storage owns:

- non-secret local settings
- secure provider credentials
- local dictionary
- snippets
- style presets

Secrets must not be stored in plain browser localStorage.

### Native Capability Layer

Rust/Tauri owns:

- focused-field detection
- global hotkeys
- text insertion
- OS capability checks
- secure storage bridge where needed

### Optional Cloud Layer

The backend owns only optional functionality:

- auth
- sync
- managed provider usage
- usage metering
- billing
- teams

## Provider Interfaces

Detailed provider planning lives in `docs/PROVIDER_STRATEGY.md`.

Initial conceptual interfaces:

```ts
type SpeechToTextProvider = {
  id: string;
  transcribe(input: TranscriptionInput): Promise<TranscriptResult>;
};

type TextRewriteProvider = {
  id: string;
  rewrite(input: RewriteInput): Promise<RewriteResult>;
};
```

Provider outputs must be normalized before the rest of the app sees them.

## Error Strategy

Errors should identify which stage failed:

- microphone permission
- audio recording
- focused-field capture
- transcription provider
- rewrite provider
- text insertion
- secure storage
- optional backend

The app should keep the raw transcript visible after rewrite or insertion
failure so users do not lose dictated content.

## Privacy Strategy

Default local mode:

- no account required
- no Vaak backend calls
- BYO keys stay local
- audio is sent only to the selected provider
- raw audio is not retained unless explicitly added later

Managed cloud mode:

- requires login
- uses Vaak-owned provider credentials
- meters usage
- must clearly disclose server processing

## Backend Boundary

Backend is not part of Milestone 1. Do not add backend dependency to the local
dictation path.
