# Text Insertion Map

This is the current guarded insertion path for local dictation.

## Runtime Flow

1. Focus capture
   - Hotkey start calls `platform::get_focused_field` from
     `emit_dictation_start`.
   - Manual start calls the Tauri command `capture_dictation_target`.
   - Both paths store one `FocusedFieldInfo` snapshot in `SessionStore`.

2. Frontend recording and transcription
   - `useDictationSession` owns recording state and focused-field UI state.
   - `useDictationLoop` transcribes the completed recording.
   - Blank or locally skipped transcripts do not call insertion.

3. Guarded insertion
   - Frontend calls `insertIntoActiveTarget(text)`.
   - Tauri command `insert_into_active_target` consumes the stored target.
   - Platform code calls `insert_text_for_captured_target(text, captured)`.
   - Windows resolves the current writable UIA target and rejects insertion if
     it no longer matches the captured target.

4. Strategy selection
   - Terminal-like targets use `send_input`.
   - Editor, document, browser, and caret-owner surfaces try
     `clipboard_paste`, then `send_input`.
   - Simple writable controls use `uia_valuepattern`.

## Key Files

- `apps/desktop/src/features/dictation/hooks/useDictationSession.ts`
  coordinates recording, target capture, hotkey events, and streaming state.
- `apps/desktop/src/features/dictation/hooks/useDictationLoop.ts`
  transcribes audio, skips empty transcripts, calls insertion, and records
  insertion outcomes.
- `apps/desktop/src/lib/tauri/focus.ts`
  exposes the frontend Tauri wrappers.
- `apps/desktop/src-tauri/src/session.rs`
  stores the current captured dictation target.
- `apps/desktop/src-tauri/src/commands/mod.rs`
  exposes `capture_dictation_target` and `insert_into_active_target`.
- `apps/desktop/src-tauri/src/platform/windows/focus.rs`
  resolves the best writable UI Automation target.
- `apps/desktop/src-tauri/src/platform/windows/targeting.rs`
  scores candidates and picks an insertion strategy.
- `apps/desktop/src-tauri/src/platform/windows/insert.rs`
  validates the captured target and applies insertion.

## Production Invariants

- A dictation target is captured before recording begins.
- A failed capture clears any previous target.
- A target is consumed by insertion, so a later insertion must capture again.
- Insertion must never silently switch to a different focused field.
- Empty or whitespace-only transcripts are skipped before native insertion.
- Native insertion logs candidate selection, target mismatch, strategy attempts,
  and strategy failures.
