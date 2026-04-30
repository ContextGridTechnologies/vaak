# Permissions

Vaak needs OS and browser permissions only for features the user actively uses.

## Required For Milestone 1

### Microphone

Purpose:

- record the user's voice for dictation

Behavior:

- request when the user starts setup or recording
- show a clear error if denied
- allow device selection

### Focused-Field Access

Purpose:

- detect the currently focused text target before dictation

Behavior:

- Windows implementation uses native focus/UI Automation capabilities already
  present in the app
- macOS support will require Accessibility permissions when implemented

### Text Insertion

Purpose:

- insert the final transcript into the app the user was already using

Behavior:

- use the existing Tauri/Rust insertion capability
- show actionable failure states
- never silently discard generated text

### Global Hotkeys

Purpose:

- start/stop dictation without switching to Vaak

Behavior:

- default hotkeys should be visible and configurable later
- failed hotkey registration should not prevent manual recording

## Not Required For Milestone 1

- login
- contacts/calendar/email access
- screen recording
- filesystem-wide access
- background upload permissions

## Permission Principle

Ask only when the feature needs it. Explain failure states inside the app.
