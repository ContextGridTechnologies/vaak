# Audio Processing Plan

Vaak uses local audio processing to improve transcription quality before sending
audio to the selected speech provider. The goal is to improve quiet and distant
speech without making close-mic recordings worse.

This plan is intentionally phased. Audio quality is hardware, room, browser, and
provider dependent, so every phase must be validated with real recordings before
the next phase is tuned.

## Current Pipeline

The desktop app captures two audio paths:

- Raw recording: the original `MediaRecorder` output, normally `audio/webm`.
- Processed recording: local PCM samples from the capture worklet converted to
  `audio/wav` segments for transcription when capture analysis is ready.

Current local processing includes:

- Frame-based speech detection.
- Noise-floor estimation from the beginning of the capture.
- SNR-based unclear capture detection.
- Leading and trailing silence trim.
- Long-pause segmentation.
- Processed WAV generation at 16 kHz mono.
- Original raw audio fallback for selected provider paths and unclear captures
  with a meaningful peak.

Processed audio artifacts may be used in memory in production, but persisted
processed artifacts remain development-only unless explicitly enabled.

## Phase 1: Capture Constraints and Safe Gain

Status: implemented.

Purpose:

- Improve quiet, distant, or soft-spoken dictation.
- Preserve close-mic speech quality.
- Avoid amplifying silence or low-SNR noise into fake speech.

Implemented behavior:

- Requests browser/device capture processing where available:
  - `autoGainControl: true`
  - `noiseSuppression: true`
  - `echoCancellation: true`
  - `channelCount: 1`
- Normalizes processed speech segments toward a target RMS.
- Caps maximum gain to prevent excessive noise lift.
- Applies a peak ceiling to avoid clipping.
- Keeps SNR as the main quality gate before transcription.

Default tuning:

- Target RMS: `-12 dBFS`
- Maximum gain: `+20 dB`
- Peak ceiling: `-1 dBFS`
- Minimum SNR: `8 dB`

Validation matrix:

- Close mic, normal speech.
- Far mic, normal speech.
- Close mic, soft speech.
- Far mic, soft speech.
- Silence only.
- Keyboard or room noise without speech.

Pass criteria:

- Quiet speech should produce a usable processed WAV segment.
- Close-mic speech must not clip or become distorted.
- Silence-only captures must still be skipped.
- Low-SNR background noise must not become a transcribed capture.
- Transcription quality should improve or stay neutral compared with raw audio.

## Phase 2: Pause Capping

Status: implemented foundation.

Purpose:

- Avoid collapsing natural thinking pauses too aggressively.
- Keep long recordings smaller and provider-friendly.
- Preserve enough timing context for lecture-style or long-form dictation.

Implemented behavior:

- Pauses shorter than the long-pause threshold are preserved.
- Pauses longer than the threshold are capped instead of collapsed to a tiny
  separator.

Default tuning:

- Pause compression trigger: `5000 ms`
- Retained pause after compression: `3000 ms`

Pass criteria:

- Pauses under `5s` remain natural.
- Pauses above `5s` are reduced but still audible enough to preserve context.
- Multi-segment transcription remains ordered and coherent.

## Phase 3: Production Diagnostics and Tuning

Status: planned.

Purpose:

- Make audio quality measurable instead of subjective.
- Tune thresholds using actual Vaak recordings.
- Detect regressions across microphones and providers.

Planned diagnostics:

- Raw peak dBFS.
- Raw voiced RMS dBFS.
- Processed peak dBFS.
- Processed voiced RMS dBFS.
- Applied gain dB.
- Estimated SNR dB.
- Segment count.
- Longest pause.
- Pause duration removed.
- Clipping or limiter count.

Planned validation:

- Compare raw vs processed transcription per provider.
- Keep a small local fixture set for regression tests.
- Add provider-specific routing only when measured results justify it.

## Phase 4: Advanced Processing

Status: planned, only after Phase 3 evidence.

Candidates:

- Soft limiter or compressor for very dynamic speech.
- Better resampling if browser-provided sample rates produce artifacts.
- Optional stronger noise reduction if browser constraints are insufficient.
- Provider-specific processed/raw preference rules.

These should not be added until diagnostics show a clear need. Over-processing
can hurt speech recognition by removing consonants, clipping transients, or
amplifying room noise.

## Manual Test Procedure

For each validation recording:

1. Record the same phrase with raw and processed audio available in development.
2. Save the transcript result, provider, microphone, distance, and room condition.
3. Compare raw vs processed transcription error by word-level mistakes.
4. Listen for clipping, pumping, or background-noise lift.
5. Keep any failing samples as local test fixtures if they are safe to store.

Suggested phrase:

```text
Vaak should capture quiet speech accurately while preserving natural pauses between thoughts.
```

Suggested long-pause phrase:

```text
This is the first sentence. [pause for 8 seconds] This is the second sentence after the pause.
```

Do not treat one successful microphone as proof. Validate at least one built-in
laptop microphone, one USB microphone, and one headset microphone before calling
the tuning production-ready.
