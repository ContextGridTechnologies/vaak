# BlueVoice.ai Roadmap and Goals

This document defines the product goal and a phased development plan for the desktop "voice OS" app.

## Product Goal

Build a cross-platform (Windows, macOS) desktop app that:

- Listens to the user's voice on-demand.
- Detects the focused text field in any app.
- Inserts transcribed or LLM-generated text into that field.
- Supports command mode for OS actions (example: "turn on dark mode").

## Success Criteria (v1)

- Reliable dictation into focused fields across common apps.
- Fast and stable: low latency, no crashes during dictation.
- Clear permissions flow and secure API key storage.
- Simple UI with status, hotkey control, and settings.

## Non-Goals (initial)

- No full local LLM or offline STT in v1.
- No enterprise or multi-user features.
- No mobile app in v1.

## Guiding Principles

- OS-first reliability: correctness over flashy UI.
- Capability-driven architecture: UI calls capabilities, not OS-specific logic.
- Minimize permissions: request only when needed.
- Fast iteration: start cloud-first, upgrade later.

## Phased Roadmap

### Phase 0: Foundation (now)

- Tauri + React + TypeScript + Rust scaffold.
- Build and run on Windows (in progress).
- Basic documentation in `docs/`.

Exit criteria:

- App runs locally with a blank UI.
- Toolchain and prerequisites are stable and repeatable.

### Phase 1: OS Access Spike

Goal: prove we can detect focus and insert text.

Windows:

- Detect focused text field (UI Automation).
- Insert text into field (UIA/TSF or input injection).

macOS:

- Accessibility permission flow.
- Focused field detection (AXUIElement).
- Insert text (AX + CGEvent).

Exit criteria:

- A small test app can detect and insert text in both OSes.

### Phase 2: Dictation Pipeline (MVP)

- Microphone capture + push-to-talk toggle.
- STT integration (cloud provider, API key).
- Insert transcription into focused field.
- Basic error handling and logging.

Exit criteria:

- End-to-end dictation works in real apps with acceptable latency.

### Phase 3: Command Mode (MVP)

- Intent parsing (LLM).
- Safe system actions (dark mode, open app, etc.).
- Permissions check + confirmation UX for risky commands.

Exit criteria:

- 3 to 5 reliable commands per OS with clear UX.

### Phase 4: UX and Settings

- Onboarding and permission screens.
- API key entry + model selection.
- Tray icon + global hotkey.
- Minimal design system.

Exit criteria:

- Usable daily driver for early testers.

### Phase 5: Reliability and Packaging

- Crash and error logging (local).
- Performance profiling + latency goals.
- App signing and installers.
- Release automation (manual steps OK initially).

Exit criteria:

- Beta release ready for external users.

### Phase 6: Backend Integration (later)

- Separate backend repo.
- Account-based API key management.
- Usage metering and billing hooks.

Exit criteria:

- Users can sign in and use managed API keys.

## Risks and Unknowns

- Accessibility APIs vary across apps and OS versions.
- Text insertion reliability differs per app.
- LLM latency and cost can impact UX.

## Definition of Done for Each Phase

- Documented requirements and success criteria.
- Working demo video or recorded test.
- Test checklist for Windows and macOS.
