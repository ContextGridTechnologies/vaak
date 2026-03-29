# Phase 2: Dictation Pipeline (MVP)

## Status: IN_PROGRESS

## Goal

Deliver end-to-end dictation input from microphone capture through transcription insertion into the currently focused field.

## Non-Goals

- Advanced audio processing controls as a first-class feature.
- Offline STT as a default path.

## Prerequisites

- Phase 1 Windows capability flow available.

## Deliverables

- [x] Microphone selection UI with persisted device choice.
- [x] Recording start/stop flow wired to selected microphone.
- [x] Device change handling with graceful fallback.
- [ ] STT provider integration.
- [ ] Insert transcription into focused field automatically.
- [ ] Dictation latency and error handling baseline.

## Tasks

### 2.1 Microphone device UX

- [x] Enumerate audio input devices.
- [x] Show selected microphone in dictation panel.
- [x] Persist selection in local storage.
- [x] Handle missing/unplugged selected device.

### 2.2 Recorder pipeline

- [x] Pass selected `deviceId` to recorder constraints.
- [x] Keep start/stop/reset behavior consistent.
- [x] Surface capture failures to UI.

### 2.3 STT integration

- [ ] Add provider selection and API key flow.
- [ ] Stream or batch audio to STT provider.
- [ ] Parse transcription and normalize punctuation.

### 2.4 Insertion and reliability

- [ ] Send transcript into Phase 1 insertion capability.
- [ ] Add retry/error handling around transient failures.
- [ ] Capture latency and failure metrics for tuning.

## Exit Criteria

- [ ] User can press to dictate and see text inserted in real apps.
- [ ] End-to-end latency is acceptable for interactive use.
- [ ] Dictation failures are actionable and user-visible.

## Testing Checklist

- [x] Select non-default mic and record; playback reflects selected device.
- [x] Unplug selected mic; fallback to default occurs.
- [x] Restart app; selected device persists when available.
- [ ] Dictate in at least two target apps and verify insertion.

## Technical Notes

- Current audio capture is browser API based (`navigator.mediaDevices` + `MediaRecorder`).
- Current device preference key: `bluevoice.mic.deviceId`.
- macOS-specific dictation support remains deferred.

## Risks

- Device labels are unavailable until mic permission is granted.
- Consumer audio devices may report duplicate/generic names.
- STT provider latency and cost profile can impact UX.

## Open Questions

- Should we expose an explicit "Request Microphone Access" control?
- Should we expose advanced constraints (echo cancellation, noise suppression)?

## Log

| Date       | Update |
|------------|--------|
| 2025-12-30 | Microphone selection UI and device persistence implemented. |
| 2025-12-30 | Recorder integration updated to use selected device and fallback handling. |
| 2026-02-07 | Consolidated Phase 2 plan into standardized phase template. |
