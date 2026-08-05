# Dictation Experience Future Scope

## Purpose

This document scopes possible improvements to Vaak's desktop dictation
experience after the current provider-based dictation loop is reliable.

It is an execution backlog beneath `docs/ROADMAP.md`, not a second roadmap.
Items move into an active milestone only when user evidence and implementation
capacity justify them.

## Scope Boundary

This scope covers:

- dictation quality and personalization
- recording controls
- insertion behavior
- local history and privacy controls
- desktop workflow integrations
- interface accessibility and localization

This scope intentionally excludes:

- local speech-model download, management, or inference
- accounts, sync, billing, managed usage, and team features
- mobile applications
- copying every preference exposed by another dictation product

## Product Rules

- Preserve hold-to-talk as the default until another mode proves more reliable.
- Preserve raw transcripts even when cleanup or rewrite is enabled.
- Keep automatic actions such as submitting text disabled by default.
- Keep vocabulary, prompts, and preferences local unless the user later enables
  an explicit sync feature.
- Add platform-specific controls only when they solve a demonstrated failure.
- Prefer one clear default over a settings page full of expert knobs.

## Priority Overview

| Priority | Item | User outcome | Relative effort |
| --- | --- | --- | --- |
| P0 | Transcript cleanup and rewrite | Spoken thoughts arrive as usable text | Medium |
| P0 | Language selection and detection | Dictation is not restricted to English | Medium |
| P0 | Personal dictionary | Names and domain terms are recognized consistently | Medium |
| P0 | Toggle-to-record mode | Users can dictate without holding a shortcut | Medium |
| P1 | Recording and audio feedback | Recording state is obvious without watching the screen | Small |
| P1 | History and audio retention controls | Users control how long sensitive local data remains | Small |
| P1 | Safe output actions | Users can optionally copy, add spacing, or submit text | Medium |
| P1 | Capsule presentation modes | Users can choose hidden, compact, or detailed feedback | Medium |
| P2 | External control interface | Other desktop tools can start, stop, or cancel dictation | Medium |
| P2 | Startup and tray preferences | Background behavior matches the user's workflow | Small |
| P2 | Interface localization | The app shell is usable in more languages | Large |
| P3 | Linux insertion support | The complete dictation loop works on Linux | Extra large |

## P0: Quality And Core Control

### 1. Transcript Cleanup And Rewrite

Add an optional stage that turns the raw provider transcript into polished text.

Minimum scope:

- direct transcript and polished rewrite modes
- a separately selected rewrite provider and model
- a small set of built-in rewrite styles
- local custom rewrite instructions
- raw transcript retained alongside final text
- raw transcript used as the safe fallback when rewrite fails

Acceptance criteria:

- Users can disable rewrite and receive the original transcript.
- Rewrite failure never loses a successful transcription.
- Activity history clearly distinguishes raw and final text.
- Provider credentials remain in secure local storage.

### 2. Language Selection And Detection

Remove the fixed English assumption from the dictation path.

Minimum scope:

- `Auto detect` plus explicit language selection
- locally persisted selection
- provider capability metadata for supported language behavior
- clear handling when a provider does not support the selected option
- the selected language passed through the existing provider boundary

Acceptance criteria:

- The dictation loop no longer hardcodes `en`.
- Unsupported language choices fail before recording or fall back explicitly.
- Changing language does not require re-entering provider credentials.

### 3. Personal Dictionary

Let users maintain local vocabulary for names, acronyms, technical terms, and
preferred spellings.

Minimum scope:

- add, edit, and remove dictionary entries
- local persistence
- normalized duplicate detection
- provider hints when the provider supports them
- rewrite-stage correction when provider hints are unavailable

Acceptance criteria:

- Dictionary behavior is consistent across supported providers.
- An unsupported provider capability does not silently discard vocabulary.
- Dictionary contents never enter telemetry.

### 4. Toggle-To-Record Mode

Offer press-once-to-start and press-again-to-stop as an alternative to
hold-to-talk.

Minimum scope:

- keep hold-to-talk as the default
- one locally persisted recording-mode preference
- the same configurable shortcut for both modes
- explicit cancel behavior
- recovery from missed key-up events and interrupted recordings
- capsule state that makes an active toggle recording unmistakable

Acceptance criteria:

- Only one recording session can be active.
- A second shortcut press stops the current toggle session.
- Escape or the capsule cancel action safely discards the session.
- Provider and insertion behavior remains shared with hold-to-talk.

## P1: Workflow Polish And Privacy

### 5. Recording And Audio Feedback

Add optional start, stop, cancel, and failure sounds.

Keep this narrow:

- one enable switch
- one volume control
- a small bundled sound set
- respect the selected output device when the platform exposes one reliably

Do not add custom sound-file management initially.

### 6. History And Audio Retention Controls

Give users explicit control over local transcript and audio storage.

Minimum scope:

- separate transcript-history and audio-retention choices
- simple choices such as `Do not keep`, `7 days`, `30 days`, and `Keep`
- cleanup at startup and after a new record is saved
- clear confirmation before deleting existing retained data

Acceptance criteria:

- Expired audio and its metadata are removed together.
- Retention cleanup cannot delete files outside Vaak's data directory.
- Changing the policy explains whether existing records are affected.

### 7. Safe Output Actions

Add a small insertion policy instead of exposing every platform implementation
detail.

Candidate options:

- insert into the captured target
- copy final text without inserting
- optionally append a trailing space
- optionally submit with `Enter`, `Ctrl+Enter`, or `Command+Enter`

Safety constraints:

- submission is off by default
- submission is blocked for password and other secure fields
- the activity record states which automatic action ran
- paste delays and low-level insertion strategies remain internal unless a
  reproducible application compatibility problem requires a user control

### 8. Capsule Presentation Modes

Build on the existing movable voice capsule rather than adding another overlay.

Candidate modes:

- hidden
- compact state indicator
- detailed state with elapsed time and partial transcript when available

All modes must preserve the originally captured target and must not steal focus.

## P2: Desktop Integration

### 9. External Control Interface

Expose the existing dictation session actions through a narrow command-line
interface:

- start dictation
- stop dictation
- cancel dictation
- report current state

This interface should reuse the same session state machine as the hotkey and
capsule. It must not expose transcript or focused-field content by default.

Raycast or other launcher integrations can be separate community projects once
the command contract is stable.

### 10. Startup And Tray Preferences

Add only the controls that affect real background workflows:

- start hidden
- show or hide the tray icon

Prevent configurations that leave a running app with no visible way to reopen
or quit it.

### 11. Interface Localization

Prepare user-facing copy for translation only after the main settings structure
stabilizes.

Minimum scope:

- one message catalog
- English as the fallback
- locale-aware formatting
- right-to-left layout verification before claiming RTL support

Provider errors and operating-system errors need normalized user-facing messages
before translation.

## P3: Linux Support

Linux requires a separate platform project rather than a settings toggle.

The scope includes:

- focused-field discovery
- X11 and Wayland text insertion
- global shortcut behavior
- microphone permission and device handling
- overlay focus behavior
- packaging and update paths

Do not advertise Linux support until dictation can return text to the originally
focused target on at least one supported X11 environment and one supported
Wayland environment.

## Dependency Order

1. Complete the rewrite boundary before building rewrite styles or dictionary
   fallback correction.
2. Add provider language capabilities before exposing language choices.
3. Stabilize the recording state machine before adding toggle mode, sounds, or
   richer capsule states.
4. Define one insertion policy before adding automatic submission.
5. Define safe record deletion before exposing retention settings.
6. Stabilize internal session commands before publishing a CLI contract.

## Evidence Gates

Before starting an item:

- identify the user problem or repeated support failure it solves
- verify that the behavior does not already exist behind another UI
- choose the smallest cross-provider or cross-platform boundary that can own it
- define one runnable check for its non-trivial behavior

Before starting P2 or P3 work, prefer evidence from active users over competitor
feature parity. GitHub stars, feature lists, and download counts alone are not
proof that Vaak users need the same controls.

## Recommended First Slice

The first implementation slice should combine:

1. language selection with `Auto detect`
2. a local personal dictionary
3. direct versus polished output

These features improve the text users receive without adding another platform
integration surface. Toggle-to-record should follow after the current
hold-to-talk state machine is proven stable across the supported desktop paths.
