# BlueVoice.ai Roadmap

This document is the high-level product roadmap. Detailed planning, status, tasks, and verification live in `docs/phases/`.

## Product Goal

Build a cross-platform desktop app (Windows first, macOS second) that:

- Listens to the user's voice on demand.
- Detects the focused text field in another app.
- Inserts transcribed or LLM-generated text into that field.
- Supports command mode for safe system actions.

## Success Criteria (v1)

- Reliable dictation into focused fields across common apps.
- Fast and stable behavior with low user-visible latency.
- Clear permissions flow and secure API key storage.
- Simple UX with visible status, hotkey control, and settings.

## Non-Goals (v1)

- Full local LLM or offline STT by default.
- Enterprise/multi-user features.
- Mobile app support.

## Guiding Principles

- OS-first reliability over flashy UI.
- Capability-first architecture (UI calls capabilities, not OS-specific code).
- Least-privilege permission requests.
- Fast cloud-first iteration with a path to stronger local/backend controls.

## Phase Index

- Phase 0 - Foundation: `docs/phases/PHASE_0_FOUNDATION.md`
- Phase 1 - OS Access: `docs/phases/PHASE_1_OS_ACCESS.md`
- Phase 2 - Dictation Pipeline: `docs/phases/PHASE_2_DICTATION.md`
- Phase 3 - Command Mode: `docs/phases/PHASE_3_COMMAND_MODE.md`
- Phase 4 - UX and Settings: `docs/phases/PHASE_4_UX_SETTINGS.md`
- Phase 5 - Reliability and Packaging: `docs/phases/PHASE_5_PACKAGING.md`
- Phase 6 - Backend Integration: `docs/phases/PHASE_6_BACKEND.md`

## Current Snapshot

- Phase 0: complete.
- Phase 1: in progress (Windows complete, macOS deferred).
- Phase 2: in progress (microphone selection/capture complete; STT integration pending).
- Phase 3-6: planned.

## Cross-Phase Definition of Done

- Requirements and exit criteria are documented in the phase file.
- Tasks and test checklist are explicit and checkable.
- Evidence is recorded in the phase log.
- Status reflects actual implementation state.
