# ADR 001: Text Insertion Strategy (Windows)

## Status

Accepted

## Context

The app needs reliable insertion into focused text fields across heterogeneous Windows applications. A single insertion mechanism is not sufficient because applications expose different accessibility capabilities and editing behaviors.

## Decision

Use a two-step insertion strategy:

1. Attempt UI Automation ValuePattern write on the focused editable control.
2. If unsupported or rejected, fallback to keyboard input injection via SendInput.

## Why

- ValuePattern is direct and robust for compatible native controls.
- SendInput increases compatibility in apps that do not accept ValuePattern writes.
- The fallback approach materially improves real-world coverage in early phases.

## Consequences

Positive:

- Better insertion success rate across app types.
- Clear capability-first behavior exposed to the UI.

Tradeoffs:

- Input injection may be sensitive to focus timing.
- Cross-app behavior can still vary and requires targeted testing.

## Follow-ups

- Consider RuntimeId-based identity hardening for focused control tracking.
- Evaluate optional TextPattern-based insertion support if needed.
