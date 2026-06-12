# macOS Support Plan

Vaak should support macOS as a first-class desktop target while keeping the
current Windows path stable. The app should remain an open-source, local-first
voice input layer for desktop workflows, not a platform-specific demo.

This plan assumes primary development can continue from Windows, with macOS
builds produced by GitHub Actions on macOS runners and validated by Mac testers
before public release.

## Goals

- Build a working macOS `.app` and `.dmg` from the existing Tauri desktop app.
- Preserve the Windows installer and release path.
- Keep local dictation usable without a Vaak account or hosted backend.
- Make macOS permissions clear and recoverable.
- Add signing and notarization only after unsigned preview builds are working.

## Non-Goals

- Do not require a Mac for day-to-day frontend and shared backend development.
- Do not make cloud auth a prerequisite for Mac dictation.
- Do not redesign the app shell only for macOS.
- Do not add App Store distribution until direct-download distribution works.
- Do not commit Apple certificates, passwords, API keys, or notarization secrets.

## Current Baseline

The desktop app already uses Tauri and has shared frontend/Rust structure under
`apps/desktop`. The current bundle configuration is Windows-oriented:

- `apps/desktop/src-tauri/tauri.conf.json` uses `targets: "nsis"`.
- Windows packaging is documented in `docs/DEVELOPMENT.md`.
- macOS focused-field access is already called out in `docs/PERMISSIONS.md` as
  requiring Accessibility permission when implemented.

The first macOS work should extend the existing configuration instead of
replacing the Windows installer path.

## Development Model Without Owning a Mac

Windows remains useful for:

- frontend UI work
- shared TypeScript logic
- shared Rust logic that is not platform-specific
- Tauri config review
- GitHub Actions workflow authoring
- docs and release process updates

macOS is still required for:

- building real macOS app bundles
- validating WKWebView behavior
- validating microphone permission prompts
- validating Accessibility permission prompts
- validating text insertion into real Mac apps
- signing and notarization

The practical path is to use GitHub Actions `macos-latest` runners for builds
and a small tester loop for runtime validation.

## Phased Approach

### Phase 1: macOS Readiness Audit

Audit the app before changing release behavior.

Checklist:

- Review `tauri.conf.json` for platform-specific bundle assumptions.
- Review Rust modules for Windows-only APIs and conditional compilation gaps.
- Review text insertion and focused-field code paths for macOS equivalents.
- Review permissions copy and failure states for microphone and Accessibility.
- Confirm app icons include `icons/icon.icns`.

Exit criteria:

- Known Windows-only areas are documented.
- The first macOS bundle config change is small and scoped.

### Phase 2: Unsigned CI Build

Status: completed.

Add a GitHub Actions workflow or extend the existing release workflow to build
macOS artifacts on a macOS runner.

Expected behavior:

- Trigger manually with `workflow_dispatch`.
- Install Node and Rust.
- Install dependencies.
- Run the smallest meaningful checks.
- Build the Tauri app from `apps/desktop`.
- Upload `.app` and/or `.dmg` artifacts.

The first CI build can be unsigned. Testers may need to bypass Gatekeeper for
preview builds until signing is added.

Exit criteria:

- Completed: CI produces downloadable `Vaak-macOS-app` and `Vaak-macOS-dmg`
  artifacts from the manual `macOS Preview Build` workflow.
- Completed: Windows release behavior is unchanged.

### Phase 3: macOS Runtime Validation

Use the unsigned artifact with at least one Mac tester.

Validation checklist:

- App launches on Apple Silicon Mac.
- App launches on Intel Mac if available.
- First-run onboarding works.
- Microphone permission request appears at the right time.
- Recording starts and stops reliably.
- Provider API key storage works through the OS keyring.
- Transcription works with BYO provider keys.
- Focus capture behavior is understood.
- Text insertion behavior is implemented or clearly blocked with recoverable UI.
- Floating voice capsule behavior is acceptable on macOS.
- App close, reopen, tray, and window behavior match desktop expectations.

Exit criteria:

- Known Mac blockers are filed or documented.
- Preview builds are usable enough for a narrow tester group.

### Phase 4: macOS Native Completion

Status: implementation complete; real-device validation pending.

Implement the Mac-specific native pieces needed for real dictation workflows.

Likely areas:

- Completed: Microphone usage metadata is included in the macOS app bundle with
  `NSMicrophoneUsageDescription`.
- Completed: Accessibility permission detection and guidance is exposed through
  the desktop platform boundary and shown in setup when required.
- Completed: Focused text target detection on macOS captures AX metadata after
  Accessibility permission is granted.
- Completed: Text insertion on macOS uses the captured AX target, validates that
  focus still matches, refocuses the target, and inserts with clipboard paste.
- Completed: Global hold-to-talk hotkeys on macOS use a native modifier event
  tap for `Control+Command`; command mode uses `Control+Command+Option`.
- Completed: Input Monitoring permission status is exposed through
  `get_input_monitoring_permission_status` and shown in setup only when the
  platform requires it.
- Completed: macOS-specific floating capsule/window behavior now keeps the
  existing capsule UI but opts into native Spaces/full-screen behavior with
  AppKit collection behavior, floating window level, runtime always-on-top, and
  visible-on-all-workspaces handling.
- Completed: macOS native main-window polish hides the duplicate native title,
  makes the decorated AppKit titlebar transparent over the app background, and
  updates the native window background for light and dark themes.
- Completed: macOS insertion strategy handling keeps clipboard paste as the
  active insertion path so dictated text inserts at the caret instead of
  replacing existing AX field contents.
- Completed: macOS target matching now accepts exact AX stable identity and a
  conservative same-process, same-window, same-AX-identifier fallback for benign
  stable ID drift.
- Completed: macOS structured focus/insertion diagnostics now log selected
  targets, insertion strategy attempts, strategy success/failure, and target
  mismatch payloads with the same operation-id pattern as Windows.
- Completed: Platform-specific permission denial messages are exposed for
  macOS Accessibility and Input Monitoring requirements.

Implementation status:

- Completed in previous changes: macOS Accessibility permission status is
  available through `get_accessibility_permission_status`; non-macOS platforms
  report that Accessibility permission is not required; setup shows the macOS
  guidance only when the platform requires it.
- Completed in current changes: macOS `get_focused_field` now uses Accessibility
  APIs to capture the focused text-like AX element and map it into the existing
  `FocusedFieldInfo` contract without changing the Windows focus or insertion
  paths.
- Completed in current changes: macOS text insertion is wired through
  `insert_text`, `insert_text_for_stable_id`,
  `insert_text_for_captured_target`, and `capture_and_insert` after
  Accessibility permission checks. Empty text returns `noop`; changed focused
  targets return `target_changed`; successful insertion reports
  `clipboard_paste`.
- Completed in current changes: macOS global hotkey normalization defaults to
  `Control+Command`, derives `Control+Command+Option` for command mode, and
  accepts common Command aliases while keeping Option reserved for command mode.
- Completed in current changes: Input Monitoring permission status is available
  through the backend and setup checklist.
- Completed in current changes: macOS captured target matching accepts a
  conservative AX identifier fallback when stable IDs drift inside the same
  process and window.
- Still pending at the validation level: runtime validation on a real Mac with
  Accessibility and Input Monitoring permissions granted.

Exit criteria:

- A Mac user can dictate into another app without using a Vaak account.
- Permission denial states explain what to do next.
- Windows behavior still passes existing verification.

### Remaining Module Gaps Compared With Windows

The known macOS backend module gaps tracked in this plan are now implemented.
Remaining work is real-device validation and any follow-up issues found there.

### Next Remaining Steps

1. Run the `macOS Preview Build` workflow and download the unsigned `.app` and
   `.dmg` artifacts.
2. Validate the unsigned build on a real Apple Silicon Mac.
3. Validate on an Intel Mac if one is available; if not, document Apple Silicon
   as the initial preview support target.
4. Complete the runtime checklist in Phase 3, including microphone prompts,
   provider key storage, BYO transcription, focused target capture, text
   insertion into real apps, capsule behavior, and app lifecycle behavior.
5. File or document any Mac-only blockers found during validation.
6. Decide whether preview artifacts stay as workflow artifacts or attach to
   tagged releases.
7. After unsigned validation passes, proceed to signing and notarization.

### Phase 5: Signing and Notarization

Add signing only after unsigned artifacts are proven.

Requirements:

- Apple Developer Program membership.
- Developer ID Application certificate for direct download distribution.
- GitHub Actions secrets for certificate and notarization credentials.
- Hardened runtime and entitlements configured for the app's real needs.

Secrets must live only in GitHub Actions or a secure local keychain, never in the
repository.

Exit criteria:

- CI produces a signed and notarized `.dmg`.
- Downloaded builds open without Gatekeeper bypass instructions.
- Release notes clearly identify the macOS build as preview or stable.

## Release Policy

Initial macOS artifacts should be labeled as preview builds until native
dictation has been validated on real Mac machines.

Recommended labels:

- `macOS preview`: launches and core setup works, but native insertion may still
  be under validation.
- `macOS beta`: dictation into real apps works for testers, but signing,
  notarization, and edge cases may still be maturing.
- `macOS stable`: signed, notarized, and validated across common workflows.

Do not present Mac support as stable until microphone capture, provider setup,
focused target handling, text insertion, and app lifecycle behavior are all
validated.

## Verification

For shared code changes, run the normal project checks:

```powershell
npm run typecheck
npm --prefix apps/desktop run lint
npm run test
npm run build
```

For Rust/Tauri changes, also run:

```powershell
cargo check
```

from `apps/desktop/src-tauri`.

For macOS CI changes, verify:

- the workflow runs on `macos-latest`
- artifacts are uploaded
- Windows workflows are unaffected
- release assets use clear platform-specific names

## Open Decisions

- Whether macOS preview artifacts should be attached to tagged releases or only
  uploaded as workflow artifacts.
- Whether to build universal binaries immediately or start with Apple Silicon.
- Whether to keep direct download as the only Mac distribution path before
  considering the Mac App Store.
- Which Mac tester matrix is sufficient before calling the build stable.
