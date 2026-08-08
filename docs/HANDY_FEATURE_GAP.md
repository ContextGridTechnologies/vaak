# Handy Feature Checklist

> **DO NOT COMMIT THIS FILE.** Internal working document for feature comparison
> only.

Compared with the current Vaak implementation. Features Vaak already has and
Handy's locally downloaded speech-model stack are marked separately.

## Already covered by Vaak

- Desktop-wide shortcut dictation into the focused text field.
- Hold-to-talk capture and floating capsule start/stop controls.
- Microphone permission, device selection, and refresh.
- Provider-backed transcription with selectable remote providers.
- Local history, transcript copy, audio playback, export, and retry/recovery.
- Startup launch, system tray access, and movable capsule.
- Local-first use without a Vaak account.

## Handy features still missing in Vaak

### Text quality and personalization

- Optional second-pass post-processing before insertion.
- Separate post-processing shortcut.
- Cloud/custom OpenAI-compatible rewrite providers.
- Custom rewrite prompts and output formatting.
- Fail-open behavior: paste the raw transcript if cleanup fails.
- Personal dictionary/custom words for names and technical terms.
- Explicit language selection and auto-detection through supported remote
  providers.

### Recording and output controls

- Global hotkey toggle mode: press once to start, press again to stop.
- Start/stop/cancel audio feedback with output-device and volume controls.
- Mute system audio while recording.
- Cancel with `Escape` or a visible cancel control without inserting text.
- Optional auto-submit with `Enter`, `Ctrl+Enter`, `Cmd+Enter`, or `Super+Enter`.
- Optional trailing space after insertion.
- User-selectable paste methods: normal paste, alternate paste shortcuts,
  direct input, or clipboard-only output.
- Clipboard policy: restore the previous clipboard or keep the transcript.

### History and app behavior

- History limit and automatic audio cleanup by age.
- Manual history deletion and protected/starred entries.
- Directly open the recordings folder.
- Start-hidden preference.
- Show/hide tray icon preference.

### Integrations and platform reach

- CLI controls for start, stop, post-process, and cancel.
- Script/window-manager integration and Raycast control.
- Localized settings UI with RTL support.
- Linux desktop support, including X11/Wayland insertion paths.

## Exclude from the feature list

- Offline local speech transcription.
- Downloading, switching, or managing Whisper, Parakeet, Moonshine, Canary,
  SenseVoice, GigaAM, or other local speech models.
- Custom local model discovery.
- Model unload timers, GPU/VRAM controls, and model-specific acceleration.

These belong to Handy's local-model architecture and are outside Vaak's current
provider-based direction.

Handy's FAQ says it does not currently support system-audio transcription or
real-time live captions, so neither is a missing Vaak feature.

Sources: [Handy](https://handy.computer/), [Handy docs](https://handy.computer/docs),
[post-processing](https://handy.computer/docs/post-processing), [paste methods](https://handy.computer/docs/paste-methods),
and [Handy source](https://github.com/cjpais/Handy).
