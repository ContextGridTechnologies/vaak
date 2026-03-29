# Phase 1: OS Access Spike

## Status: IN_PROGRESS (Windows complete, macOS deferred)

## Goal

Prove we can detect the currently focused text field and insert text into it through a stable capability API.

## Non-Goals

- End-to-end dictation pipeline.
- LLM intent parsing.
- Production UX polish.

## Prerequisites

- Phase 0 complete.

## Deliverables

- [x] Windows focused field detection via UI Automation.
- [x] Windows text insertion with fallback strategy.
- [x] Tauri command surface and typed TypeScript wrappers.
- [x] Minimal debug UI for capture/insert testing.
- [ ] macOS accessibility permission flow and insertion path.

## Tasks

### 1.1 Capability and API contracts

- [x] Define shared focused field and insertion result types.
- [x] Expose typed Tauri commands.
- [x] Add TS wrappers under `apps/desktop/src/lib/tauri/`.

### 1.2 Windows implementation

- [x] Capture focused element metadata from UI Automation.
- [x] Read current text where available.
- [x] Insert text using ValuePattern when writable.
- [x] Fallback to SendInput for apps that reject UIA value set.

### 1.3 macOS implementation

- [ ] Add AX permission checks and guided error messages.
- [ ] Implement focused element capture via AXUIElement.
- [ ] Implement insertion via AX value write with CGEvent fallback.

### 1.4 Verification and evidence

- [x] Validate Windows flow in real apps.
- [ ] Validate macOS flow in real apps.
- [x] Document command behavior and known limits.

## Exit Criteria

- [x] Windows: detect active text field in at least two apps.
- [x] Windows: insert text with a single UI button press.
- [ ] macOS: detect active text field in at least two apps.
- [ ] macOS: insert text with a single UI button press.

## Testing Checklist

- [x] Windows Notepad: capture and insert text.
- [x] Windows browser text input: capture and insert text.
- [ ] macOS TextEdit: capture and insert text.
- [ ] macOS Safari text input: capture and insert text.

## Technical Notes

- Implemented commands:
  - `get_focused_field`
  - `insert_text`
  - `capture_and_insert`
- Current insertion strategy:
  1. UIA ValuePattern write
  2. SendInput fallback
- Current stable identifier is based on handle + automation/class/type fields; runtime ID hardening is still optional follow-up.

## Risks

- Accessibility APIs vary by host application.
- Input injection reliability differs across app families.
- macOS permission UX can create first-run friction.

## Open Questions

- For Windows, should we add TextPattern insertion support beyond current fallback flow?
- For macOS, should AX value write or CGEvent be primary by default?

## Log

| Date       | Update |
|------------|--------|
| 2025-12-30 | Windows implementation completed for focus capture and insertion fallback. |
| 2025-12-30 | Added typed TS wrappers and debug panel for manual testing. |
| 2026-02-07 | Consolidated status and plan into this single phase file. |

## References

- UIA overview: <https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-uiautomationoverview>
- IUIAutomation: <https://learn.microsoft.com/en-us/windows/win32/api/uiautomationclient/nn-uiautomationclient-iuiautomation>
- ValuePattern: <https://learn.microsoft.com/en-us/windows/win32/api/uiautomationclient/nn-uiautomationclient-iuiautomationvaluepattern>
- SendInput: <https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput>
- AXUIElement: <https://developer.apple.com/documentation/applicationservices/axuielement>
- AX trust check: <https://developer.apple.com/documentation/applicationservices/1459186-axisprocesstrustedwithoptions>
