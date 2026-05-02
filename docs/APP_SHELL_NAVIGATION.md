# App Shell And Navigation

## Purpose

Define the main desktop app experience after onboarding.

The current post-onboarding screen still behaves like a setup dashboard. It
shows provider cards, setup checklists, and onboarding-style copy even after
the user has already completed onboarding. That is the wrong default state for
the product.

The app shell should feel like a production desktop tool:

- focused
- operational
- compact
- local-first
- easy to understand at a glance

Configuration depth should live in Settings, not on the default landing screen.

## Current Problem

Today the main `Voice` screen is effectively reusing onboarding UI:

- `DictationPanel` renders `VoiceSetupPanel`
- `VoiceSetupPanel` shows setup cards and provider catalog cards
- the default screen looks like a readiness dashboard instead of a working app

This creates four product problems:

- The first screen after onboarding feels unfinished.
- Provider setup is duplicated between the main screen and Settings.
- The information architecture is inverted: setup is front and center, usage is
  secondary.
- The app exposes too much surface area before the core workflow is clear.

## Product Decision

After onboarding, the app should open into a simple sidebar-based shell with
three visible destinations:

- Home
- Settings
- Account

Only `Home` and `Settings` are active in Milestone 1.

`Account` can be visible as a product direction signal, but it should clearly
render as `Coming soon` and must not block local usage.

Do not show `Commands` or `Diagnostics` in the visible primary navigation until
those areas are production-ready.

## Design Principles

- Default to action, not setup.
- Keep the shell small and desktop-like.
- Move advanced or infrequent configuration into Settings.
- Keep local mode clearly available without account dependency.
- Avoid repeating the same provider information in multiple places.
- Preserve existing provider and onboarding logic where it already works.

## Navigation Model

Use a left sidebar as the primary app navigation.

```text
App shell
  Sidebar
    Home
    Settings
    Account

  Main content
    selected section
```

### Sidebar Requirements

- The sidebar should be always visible on desktop widths.
- The selected section should be visually obvious.
- The sidebar should use compact labels and lucide icons.
- `Account` should show a disabled or muted `Coming soon` treatment.
- The shell should preserve the existing top-level app header.

## Home Screen

## Goal

Make the default screen feel like the place where the user operates Vaak, not
the place where they configure every subsystem.

## Home Should Show

- current local mode status
- current hold-to-talk shortcut
- microphone readiness summary
- provider readiness summary
- a compact explanation of how to start dictating
- a clear path into Settings when configuration is needed

## Home Should Not Show

- provider catalog cards
- onboarding checklist language
- onboarding marketing tiles
- raw provider setup forms
- large setup dashboards

## Home Structure

The Home screen should stay compact and operational.

Suggested structure:

```text
Home
  voice status
  current shortcut
  quick usage guidance
  focused warnings if setup is incomplete
  small actions that route to Settings
```

### Copy Direction

Home copy should sound like an active desktop tool, not a first-run wizard.

Use copy such as:

- `Ready to dictate`
- `Hold Ctrl + Win to speak`
- `Microphone access needed`
- `Open Settings to finish provider setup`

Avoid copy such as:

- `Configure your voice layer`
- `Bring your providers`
- `Provider setup next`

## Settings

Settings should become the canonical place for app configuration.

## Goal

A user should be able to open Settings and find all local configuration there
without needing a separate setup dashboard.

## Settings Sections

Milestone 1 Settings should cover:

- Speech provider
- Microphone
- Hold-to-talk shortcut
- App preferences

The existing provider settings implementation should remain the source of truth
for provider setup and testing.

## Settings Structure

```text
Settings
  Speech provider
    selector
    selected provider panel
    provider test action

  Microphone
    permission status
    selected input device

  Shortcut
    current dictation shortcut
    edit flow
    reset to default

  App preferences
    local-mode and desktop behavior settings
```

### Implementation Note

Do not rebuild provider logic on the Home screen.

Instead:

- keep provider configuration in `SettingsPanel`
- expand Settings over time for microphone and hotkey controls
- let Home read status only

## Account

## Goal

Reserve space for future sync and account features without making them feel
required for local dictation.

## Milestone 1 Behavior

The `Account` destination should render a clean placeholder screen with:

- title
- short description
- `Coming soon` messaging
- explicit note that local dictation works without sign-in

Example direction:

```text
Account
Sync, team, and managed features will arrive later.
Local dictation stays available without an account.
```

## App Header

Keep the current app header direction:

- Vaak brand
- product title
- short product subtitle
- local mode badge

The current disabled `Sign in for sync` action can either:

- stay in the header temporarily, or
- move under the future `Account` section

The sidebar work does not require finalizing that detail immediately.

## Component Direction

Prefer evolving the current architecture instead of replacing it wholesale.

### Expected Frontend Shape

```text
app/
  App.tsx
  AppLayout.tsx
  navigation.ts

features/
  home/
    HomePanel.tsx
  settings/
    SettingsPanel.tsx
  account/
    AccountPanel.tsx
  dictation/
    status hooks or compact home widgets as needed
```

### Key Refactors

- stop using `VoiceSetupPanel` as the post-onboarding default screen
- keep `VoiceSetupPanel` only if it still serves onboarding-specific flows
- introduce a dedicated `HomePanel`
- let `AppLayout` own sidebar navigation state

## Out Of Scope

This document does not require:

- account authentication
- sync implementation
- managed cloud plans
- public navigation for Commands
- public navigation for Diagnostics
- major provider backend refactors

## Acceptance Criteria

- After onboarding, the app opens to `Home`.
- The primary shell uses a sidebar with `Home`, `Settings`, and `Account`.
- The default screen no longer shows provider catalog cards.
- The default screen no longer shows onboarding checklist copy.
- Provider configuration remains available in Settings.
- Account renders as a clear `Coming soon` placeholder.
- Local dictation does not require sign-in anywhere in the shell.

## Build Order

Implement this one slice at a time.

### Phase 1: Sidebar Shell

- Replace the top tab strip with a sidebar shell.
- Add `Home`, `Settings`, and `Account`.
- Keep unfinished sections hidden from visible navigation.

### Phase 2: Home Screen

- Create a dedicated `HomePanel`.
- Remove onboarding-style setup cards from the default screen.
- Show compact operational status and usage guidance.

### Phase 3: Settings Consolidation

- Keep provider setup in Settings.
- Add microphone and hotkey sections into Settings.
- Ensure Home links into the relevant settings section instead of duplicating
  forms.

### Phase 4: Account Placeholder

- Add a production-quality placeholder screen.
- Keep the message explicit that an account is optional for local use.

### Phase 5: Verification

- Add tests for sidebar navigation and default landing behavior.
- Add tests confirming provider cards are gone from Home.
- Add tests confirming provider setup remains in Settings.
- Run typecheck, lint, tests, and build after the shell changes settle.

## Development Notes

This change should be treated as an app-shell cleanup, not a broad product
rewrite.

The safest path is:

1. change the shell
2. replace the default screen
3. expand Settings
4. add the Account placeholder

That keeps behavior understandable and avoids mixing navigation refactors with
provider logic refactors in the same step.
