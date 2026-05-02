# ADR 001: Text Insertion Strategy (Windows)

## Status

Accepted

## Context

The app needs reliable insertion into focused text fields across heterogeneous Windows applications. A single insertion mechanism is not sufficient because applications expose different accessibility capabilities and editing behaviors.

## Decision

Use a target-aware insertion strategy:

1. Resolve the best writable target near the active focus instead of assuming `GetFocusedElement()` is the final insertion node.
2. Prefer caret-preserving insertion for editor, document, browser, and terminal surfaces by attempting clipboard paste first.
3. If paste fails but the target still looks keyboard-driven, fallback to `SendInput`.
4. Use UI Automation `ValuePattern.SetValue` only for simple writable controls where caret-preserving insertion is not available.

## Why

- Editor and terminal surfaces usually need caret-preserving behavior instead of whole-value replacement.
- Clipboard paste and `SendInput` cover browser, Electron, and document-style targets that do not expose a writable value contract.
- `ValuePattern.SetValue` remains useful for classic form inputs, but only when it does not risk overwriting existing content unexpectedly.

## Consequences

Positive:

- Better insertion success rate across classic inputs, editors, and terminal-like surfaces.
- Diagnostics now explain which target was selected and which insertion strategy ran.

Tradeoffs:

- Paste and input injection remain sensitive to focus timing and app-specific shortcut handling.
- Cross-app behavior can still vary and requires targeted Windows verification.

## Follow-ups

- Consider RuntimeId-based identity hardening for focused control tracking.
- Expand editor heuristics as more custom surfaces are verified in production logs.
