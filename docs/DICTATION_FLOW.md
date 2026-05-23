# Dictation Flow

Vaak Milestone 1 uses a hold-to-talk dictation loop for local desktop text insertion. The goal is a production-grade voice input path that works without a Vaak account or hosted backend.

## Milestone 1 Flow

1. The user focuses a writable text field in another desktop application.
2. The user holds the dictation shortcut.
3. The Tauri hotkey monitor captures the currently focused writable field and emits a dictation start event.
4. The frontend starts microphone recording through `useAudioRecorder`.
5. The user releases the dictation shortcut.
6. The frontend stops recording, analyzes the captured audio, sends eligible audio to the selected speech provider, and receives a raw transcript.
7. Vaak inserts the raw transcript into the originally captured target through the guarded backend insertion command.

Manual start and stop in the floating voice window follows the same frontend recording and insertion path. Manual start also asks the backend to capture and store the focused dictation target before recording starts. The primary activation model remains the Rust-backed global hold-to-talk shortcut.

## State Machine

The frontend dictation lifecycle is intentionally small:

- `idle`: no active recording or insertion work.
- `recording`: audio capture is active.
- `transcribing`: stopped audio is being sent to the selected provider.
- `inserting`: a non-empty transcript is being inserted into the captured target.
- `inserted`: insertion completed successfully.
- `error`: a recoverable microphone, focus, provider, or insertion error is visible to the user.

Empty transcripts are treated as a no-op. Vaak should show a clear "nothing to insert" style state and must not call insertion for empty or whitespace-only text.

## Native Focus Boundary

The native boundary is the captured focused field. On dictation start, the backend resolves the best writable target near the active UI Automation focus and records a focused-field snapshot for that target. Hotkey dictation seeds this from the Rust hotkey monitor; manual dictation seeds it through `capture_dictation_target`. On insertion, `insert_into_active_target` compares the newly resolved writable target to the captured target metadata, including its stable identity fields.

If the target changed or no captured target exists, insertion fails and Vaak surfaces the error. Vaak may use clipboard paste or keyboard input inside the same validated target when that is the correct insertion strategy for editor or terminal surfaces, but it must not silently switch to a different active field.

## Transcription Path

The selected speech provider comes from local settings. The first supported path uses the existing provider adapter surface:

- `getSelectedSpeechProvider`
- `transcribeRecording`

Before transcription, `useAudioRecorder` runs local capture analysis and may produce cleaned WAV segments. The dictation loop uses those segments when capture analysis is `ready`, except for provider paths that explicitly prefer the original recording.

Local capture analysis is a quality signal, not a universal hard gate:

- `no_speech` is skipped locally and is not sent to the provider.
- Unclear captures with no meaningful peak are skipped locally as `speech_unclear`.
- Unclear captures with a meaningful peak, currently `peakDbfs >= -24`, fall back to the original raw `.webm` recording and are sent to the selected provider.

This prevents the calibration/cleanup heuristic from dropping real speech while still avoiding provider calls for empty or effectively silent captures.

The Milestone 1 dictation loop inserts the provider's raw transcript. Rewrite, cleanup, command mode, and hosted Vaak transcription credits are out of scope for this slice.

Transport retry for provider calls follows [MODEL_CALLING_RETRY_BASE.md](MODEL_CALLING_RETRY_BASE.md). Provider-specific endpoint, polling, and retry exceptions live in [PROVIDER_SPECIFIC_RETRY.md](PROVIDER_SPECIFIC_RETRY.md).

## Insertion Policy

Insertion uses the guarded backend command path:

- Frontend: `insertIntoActiveTarget(text)`
- Backend: `insert_into_active_target`
- Platform: `insert_text_for_captured_target`

The command succeeds only when the currently focused field still matches the captured dictation target. This favors safety over convenience.

Within the validated target, the backend prefers insert-at-caret behavior:

- `clipboard_paste` for editor, document, and browser-like surfaces.
- `send_input` for validated terminal-like surfaces and as a fallback when paste fails but the target still appears keyboard-driven.
- `uia_valuepattern` only for simple writable controls where caret-preserving insertion is unavailable.

## Recoverable Errors

The UI should distinguish these error classes enough for users to recover:

- Microphone or recording failure.
- Focus capture failure, including no writable target.
- Capture-analysis skip, including no speech or effectively silent audio.
- Provider or transcription failure.
- Insertion failure, including target changed.

Errors are visible in the floating voice window through accessible status text. The app should not hide recoverable failures silently.

## Activity Retry

Activity retry is a user action after a failed activity record exists. It is not the same as transport retry inside a provider request.

Retrying a failed transcription should update the original record in place. It must not append a duplicate retry record.

Retry outcomes:

- `recovered`: retry produced non-empty transcript text, but Vaak did not automatically insert it into the original target.
- `skipped`: retry completed without transcript text and no insertion was attempted.
- `failed`: hard retry failure; keep the original failed record unchanged and show an inline retry error.

The saved record update must preserve the original `recordId`, `sessionId`, original audio artifact, original capture time, target snapshot, trigger, and mode. Only retry-owned transcript, provider, processed-audio, recording diagnostics, and insertion outcome fields should change.

## Known Limitations

- Command mode remains out of scope for Milestone 1.
- Transcript rewrite and formatting are not part of the first insertion loop.
- The guarded insertion path depends on platform focus APIs and is currently Windows-oriented.
- Optional account, sync, team, and cloud features must not block local dictation.
