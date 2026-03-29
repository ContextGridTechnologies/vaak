# Phase 4: UX and Settings

## Status: PLANNED

## Goal

Deliver a polished, daily-usable user experience for onboarding, permissions, settings, and global control surfaces.

## Non-Goals

- Full visual redesign unrelated to core workflows.
- Non-essential customization before baseline usability is complete.

## Prerequisites

- Phase 2 dictation flow available.
- Phase 3 command mode baseline available.

## Deliverables

- [ ] Onboarding and permission guidance screens.
- [ ] API key/model settings and validation.
- [ ] Tray icon controls and global hotkey behavior.
- [ ] Stable baseline design tokens/components.

## Tasks

### 4.1 Onboarding and permissions

- [ ] Build first-run onboarding flow.
- [ ] Add per-permission rationale and status indicators.
- [ ] Add quick links to OS settings where relevant.

### 4.2 Settings

- [ ] Add API key management UI.
- [ ] Add provider/model selection.
- [ ] Add hotkey and behavior preferences.

### 4.3 Desktop controls

- [ ] Add tray menu actions.
- [ ] Add global hotkey registration and conflict handling.
- [ ] Add clear status indicators for recording/command modes.

## Exit Criteria

- [ ] Early testers can use the app daily without documentation hand-holding.
- [ ] Permission and settings flows are understandable and recoverable.

## Testing Checklist

- [ ] First-run onboarding completes without dead ends.
- [ ] Settings persist across app restarts.
- [ ] Global hotkey and tray controls work consistently.

## Technical Notes

- Keep settings schema versioned for forward compatibility.

## Risks

- Permissions UX can become fragmented across OSes.
- Hotkey conflicts may degrade first-run confidence.

## Open Questions

- Which settings must be exposed in v1 versus hidden defaults?

## Log

| Date       | Update |
|------------|--------|
| 2026-02-07 | Phase file created from roadmap baseline. |
