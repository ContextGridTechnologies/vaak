# Phase 3: Command Mode (MVP)

## Status: PLANNED

## Goal

Enable natural language command mode for safe system actions with explicit guardrails and confirmations.

## Non-Goals

- Open-ended autonomous desktop control.
- High-risk actions without confirmation.

## Prerequisites

- Phase 2 dictation pipeline operational for spoken input.

## Deliverables

- [ ] Intent parsing from spoken or typed command text.
- [ ] Command execution layer with allowlisted actions.
- [ ] Confirmation UX for risky commands.
- [ ] Basic audit trail for command success/failure.

## Tasks

### 3.1 Intent understanding

- [ ] Define command intent schema.
- [ ] Map intents to executable actions.
- [ ] Add confidence and fallback behavior.

### 3.2 Safe execution

- [ ] Implement allowlisted command handlers per OS.
- [ ] Add permission checks before action execution.
- [ ] Add explicit user confirmation for risky actions.

### 3.3 UX and observability

- [ ] Show command preview before execution when needed.
- [ ] Surface errors with recovery guidance.
- [ ] Log command outcome metadata (no sensitive content).

## Exit Criteria

- [ ] 3 to 5 reliable commands per OS work end-to-end.
- [ ] Risky commands require confirmation.
- [ ] Error states are clear and recoverable.

## Testing Checklist

- [ ] Validate each allowlisted command on target OS.
- [ ] Validate denial paths when permissions are missing.
- [ ] Validate confirmation flow for risky actions.

## Technical Notes

- Keep command APIs capability-first and OS-agnostic at the UI boundary.

## Risks

- Intent ambiguity can trigger wrong actions.
- OS differences can fragment command reliability.

## Open Questions

- Which 3 to 5 commands should be in the initial allowlist?

## Log

| Date       | Update |
|------------|--------|
| 2026-02-07 | Phase file created from roadmap baseline. |
