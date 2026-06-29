use crate::platform::common::{CaptureInsertResult, PlatformError, TextInsertResult};
use crate::platform::windows::com::ComInit;
use crate::platform::windows::errors::windows_error;
use crate::platform::windows::focus::{resolve_focused_target, ResolvedFocusTarget};
use crate::platform::windows::targeting::{
    insertion_plan, next_operation_id, FocusCandidateDiagnostics, InsertionStrategy, LogPayload,
};
use crate::platform::windows::uia::{create_automation, get_current_value, get_value_pattern};
use std::mem::{size_of, size_of_val};
use std::ptr::copy_nonoverlapping;
use std::{
    thread,
    time::{Duration, Instant},
};
use windows::core::BSTR;
use windows::Win32::Foundation::{GlobalFree, HANDLE, HGLOBAL, HWND};
use windows::Win32::System::Com::IDataObject;
use windows::Win32::System::DataExchange::{
    CloseClipboard, CountClipboardFormats, EmptyClipboard, GetClipboardData,
    IsClipboardFormatAvailable, OpenClipboard, SetClipboardData,
};
use windows::Win32::System::Memory::{
    GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE,
};
use windows::Win32::System::Ole::{OleGetClipboard, OleSetClipboard};
use windows::Win32::UI::Accessibility::IUIAutomationElement;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE,
    VIRTUAL_KEY, VK_CONTROL, VK_V,
};

const CF_UNICODETEXT_ID: u32 = 13;
const CLIPBOARD_RESTORE_DELAY: Duration = Duration::from_millis(120);
const TEXT_INSERT_VERIFY_TIMEOUT: Duration = Duration::from_millis(350);
const TEXT_INSERT_VERIFY_INTERVAL: Duration = Duration::from_millis(25);
const LOG_TARGET: &str = "vaak::platform::windows";

pub(crate) fn insert_text(text: &str) -> Result<TextInsertResult, PlatformError> {
    let _com = ComInit::new()?;
    let automation = create_automation()?;
    let operation_id = next_operation_id("insert");
    let target = resolve_focused_target(&automation, &operation_id)?;
    insert_text_for_target(&operation_id, target, text)
}

#[allow(dead_code)]
pub(crate) fn insert_text_for_stable_id(
    text: &str,
    stable_id: &str,
) -> Result<TextInsertResult, PlatformError> {
    let _com = ComInit::new()?;
    let automation = create_automation()?;
    let operation_id = next_operation_id("insert");
    let target = resolve_focused_target(&automation, &operation_id)?;
    ensure_stable_target(&operation_id, stable_id, &target)?;
    insert_text_for_target(&operation_id, target, text)
}

pub(crate) fn capture_and_insert(text: &str) -> Result<CaptureInsertResult, PlatformError> {
    let _com = ComInit::new()?;
    let automation = create_automation()?;
    let operation_id = next_operation_id("insert");
    let target = resolve_focused_target(&automation, &operation_id)?;
    let field = target.diagnostics.snapshot.clone();
    let insert = insert_text_for_target(&operation_id, target, text)?;

    Ok(CaptureInsertResult { field, insert })
}

pub(crate) fn insert_text_for_captured_target(
    text: &str,
    captured: &crate::platform::common::FocusedFieldInfo,
) -> Result<TextInsertResult, PlatformError> {
    let _com = ComInit::new()?;
    let automation = create_automation()?;
    let operation_id = next_operation_id("insert");
    let target = resolve_focused_target(&automation, &operation_id)?;
    ensure_captured_target(&operation_id, captured, &target)?;
    insert_text_for_target(&operation_id, target, text)
}

fn insert_text_for_target(
    operation_id: &str,
    target: ResolvedFocusTarget,
    text: &str,
) -> Result<TextInsertResult, PlatformError> {
    if text.is_empty() {
        return Ok(TextInsertResult {
            method: "noop".to_string(),
            characters: 0,
        });
    }

    log::info!(
        target: LOG_TARGET,
        "{}",
        serialize_log_payload(LogPayload::candidate_event(
            "insert_started",
            operation_id,
            &target.diagnostics,
            None,
        ))
    );

    unsafe { target.element.SetFocus() }
        .map_err(|err| windows_error("IUIAutomationElement::SetFocus", err))?;

    for strategy in insertion_plan(&target.diagnostics) {
        let planned = with_strategy(&target.diagnostics, strategy);
        log::info!(
            target: LOG_TARGET,
            "{}",
            serialize_log_payload(LogPayload::candidate_event(
                "insert_strategy_attempted",
                operation_id,
                &planned,
                None,
            ))
        );

        let result = apply_insertion_strategy(&target.element, &target.diagnostics, strategy, text);
        match result {
            Ok(()) => {
                log::info!(
                    target: LOG_TARGET,
                    "{}",
                    serialize_log_payload(LogPayload::candidate_event(
                        "insert_strategy_succeeded",
                        operation_id,
                        &planned,
                        None,
                    ))
                );
                return Ok(TextInsertResult {
                    method: strategy.as_method().to_string(),
                    characters: text.chars().count(),
                });
            }
            Err(err) => {
                log::warn!(
                    target: LOG_TARGET,
                    "{}",
                    serialize_log_payload(LogPayload::candidate_event(
                        "insert_strategy_failed",
                        operation_id,
                        &planned,
                        Some(&err),
                    ))
                );
            }
        }
    }

    Err(PlatformError::new(
        "insert_failed",
        "No supported insertion strategy succeeded for the focused target",
    ))
}

fn apply_insertion_strategy(
    element: &IUIAutomationElement,
    target: &FocusCandidateDiagnostics,
    strategy: InsertionStrategy,
    text: &str,
) -> Result<(), PlatformError> {
    match strategy {
        InsertionStrategy::ClipboardPaste => paste_text(element, text),
        InsertionStrategy::SendInput => send_input_text(element, target, text),
        InsertionStrategy::UiaValuePattern => {
            let Some(value_pattern) = get_value_pattern(element) else {
                return Err(PlatformError::new(
                    "value_pattern_unavailable",
                    "ValuePattern was not available for the selected target",
                ));
            };
            let value = BSTR::from(text);
            unsafe { value_pattern.SetValue(&value) }
                .map_err(|err| windows_error("IUIAutomationValuePattern::SetValue", err))
        }
    }
}

fn ensure_stable_target(
    operation_id: &str,
    stable_id: &str,
    target: &ResolvedFocusTarget,
) -> Result<(), PlatformError> {
    if target.diagnostics.snapshot.stable_id == stable_id {
        return Ok(());
    }

    let captured = FocusCandidateDiagnostics::for_mismatch(stable_id);
    log::warn!(
        target: LOG_TARGET,
        "{}",
        serialize_log_payload(LogPayload::target_changed(
            operation_id,
            stable_id,
            &captured,
            &target.diagnostics,
        ))
    );

    Err(PlatformError::new(
        "target_changed",
        "Focused field changed before insertion",
    ))
}

fn ensure_captured_target(
    operation_id: &str,
    captured: &crate::platform::common::FocusedFieldInfo,
    target: &ResolvedFocusTarget,
) -> Result<(), PlatformError> {
    if captured_target_matches(captured, &target.diagnostics.snapshot) {
        return Ok(());
    }

    let captured_diagnostics = FocusCandidateDiagnostics::from_snapshot(captured.clone());
    log::warn!(
        target: LOG_TARGET,
        "{}",
        serialize_log_payload(LogPayload::target_changed(
            operation_id,
            &captured.stable_id,
            &captured_diagnostics,
            &target.diagnostics,
        ))
    );

    Err(PlatformError::new(
        "target_changed",
        "Focused field changed before insertion",
    ))
}

fn captured_target_matches(
    captured: &crate::platform::common::FocusedFieldInfo,
    current: &crate::platform::common::FocusedFieldInfo,
) -> bool {
    if current.stable_id == captured.stable_id {
        return true;
    }

    if captured.native_window_handle != 0
        && current.native_window_handle == captured.native_window_handle
        && current.control_type_id == captured.control_type_id
        && !captured.automation_id.is_empty()
        && current.automation_id == captured.automation_id
    {
        return true;
    }

    if !looks_like_same_terminal_target(captured, current) {
        return false;
    }

    if !captured.window_title.is_empty() && captured.window_title == current.window_title {
        return true;
    }

    captured.native_window_handle != 0
        && captured.native_window_handle == current.native_window_handle
}

fn looks_like_same_terminal_target(
    captured: &crate::platform::common::FocusedFieldInfo,
    current: &crate::platform::common::FocusedFieldInfo,
) -> bool {
    captured.control_type_id == current.control_type_id
        && captured.control_name == current.control_name
        && has_terminal_hint(captured)
        && has_terminal_hint(current)
}

fn has_terminal_hint(field: &crate::platform::common::FocusedFieldInfo) -> bool {
    let haystack = [
        field.window_title.as_str(),
        field.control_name.as_str(),
        field.automation_id.as_str(),
        field.framework_id.as_str(),
        field.class_name.as_str(),
    ]
    .join(" ")
    .to_ascii_lowercase();

    [
        "termcontrol",
        "powershell",
        "pwsh",
        "command prompt",
        "cmd.exe",
        "xterm",
        "terminal",
        "cascadia",
    ]
    .iter()
    .any(|hint| haystack.contains(hint))
}

fn with_strategy(
    candidate: &FocusCandidateDiagnostics,
    strategy: InsertionStrategy,
) -> FocusCandidateDiagnostics {
    let mut candidate = candidate.clone();
    candidate.selected_strategy = Some(strategy);
    candidate
}

fn serialize_log_payload(payload: LogPayload) -> String {
    serde_json::to_string(&payload).unwrap_or_else(|err| {
        format!(
            "{{\"event\":\"log_serialization_failed\",\"message\":\"{}\"}}",
            err
        )
    })
}

fn send_input_text(
    element: &IUIAutomationElement,
    target: &FocusCandidateDiagnostics,
    text: &str,
) -> Result<(), PlatformError> {
    let before = should_verify_send_input(target).then(|| get_current_value(element));
    let mut inputs: Vec<INPUT> = Vec::with_capacity(text.encode_utf16().count() * 2);

    for unit in text.encode_utf16() {
        let down = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(0),
                    wScan: unit,
                    dwFlags: KEYEVENTF_UNICODE,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        let up = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(0),
                    wScan: unit,
                    dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };

        inputs.push(down);
        inputs.push(up);
    }

    if inputs.is_empty() {
        return Ok(());
    }

    let sent = unsafe { SendInput(&inputs, size_of::<INPUT>() as i32) };
    send_input_delivery_result(sent, inputs.len())?;

    if let Some(before) = before {
        verify_text_inserted(
            element,
            &before,
            text,
            "send_input_unconfirmed",
            "SendInput did not update the focused target readback",
        )?;
    }

    Ok(())
}

fn should_verify_send_input(target: &FocusCandidateDiagnostics) -> bool {
    !has_terminal_hint(&target.snapshot)
        && (target.has_active_caret
            || target.supports_text_pattern
            || target.supports_text_pattern2
            || target.supports_text_edit_pattern)
}

fn paste_text(element: &IUIAutomationElement, text: &str) -> Result<(), PlatformError> {
    let before = get_current_value(element);
    let previous = ClipboardSnapshot::capture()?;
    set_clipboard_text(text)?;
    let result = send_paste_shortcut();
    let result = result.and_then(|()| {
        verify_text_inserted(
            element,
            &before,
            text,
            "clipboard_paste_unconfirmed",
            "Clipboard paste did not update the focused target readback",
        )
    });
    if result.is_ok() {
        thread::sleep(CLIPBOARD_RESTORE_DELAY);
    }
    previous.restore();
    result
}

fn verify_text_inserted(
    element: &IUIAutomationElement,
    before: &str,
    inserted: &str,
    error_code: &str,
    error_message: &str,
) -> Result<(), PlatformError> {
    let deadline = Instant::now() + TEXT_INSERT_VERIFY_TIMEOUT;
    loop {
        let after = get_current_value(element);
        if text_readback_confirms_insert(before, &after, inserted) {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err(PlatformError::new(error_code, error_message));
        }
        thread::sleep(TEXT_INSERT_VERIFY_INTERVAL);
    }
}

fn text_readback_confirms_insert(before: &str, after: &str, inserted: &str) -> bool {
    let inserted = inserted.trim();
    if inserted.is_empty() {
        return true;
    }

    let after = after.trim();
    if after.is_empty() {
        return false;
    }

    // vaak: UIA readback is a best-effort oracle; if it cannot show an
    // observable target change, insertion must fail instead of recording a
    // false success.
    after.contains(inserted) && after != before.trim()
}

fn send_paste_shortcut() -> Result<(), PlatformError> {
    let events = paste_shortcut_inputs();
    let mut inputs = Vec::with_capacity(events.len());
    for event in events {
        inputs.push(event.to_input());
    }

    let sent = unsafe { SendInput(&inputs, size_of::<INPUT>() as i32) };
    send_input_delivery_result(sent, inputs.len())
}

fn send_input_delivery_result(sent: u32, expected: usize) -> Result<(), PlatformError> {
    if sent as usize != expected {
        return Err(PlatformError::new(
            "send_input_failed",
            format!("SendInput sent {sent} of {expected} events"),
        ));
    }

    Ok(())
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum PasteKey {
    Control,
    V,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum KeyEventKind {
    Down,
    Up,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct PasteKeyEvent {
    key: PasteKey,
    kind: KeyEventKind,
}

impl PasteKeyEvent {
    fn to_input(self) -> INPUT {
        let key = match self.key {
            PasteKey::Control => VK_CONTROL,
            PasteKey::V => VK_V,
        };
        let flags = match self.kind {
            KeyEventKind::Down => Default::default(),
            KeyEventKind::Up => KEYEVENTF_KEYUP,
        };

        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: key,
                    wScan: 0,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }
}

fn paste_shortcut_inputs() -> [PasteKeyEvent; 4] {
    [
        PasteKeyEvent {
            key: PasteKey::Control,
            kind: KeyEventKind::Down,
        },
        PasteKeyEvent {
            key: PasteKey::V,
            kind: KeyEventKind::Down,
        },
        PasteKeyEvent {
            key: PasteKey::V,
            kind: KeyEventKind::Up,
        },
        PasteKeyEvent {
            key: PasteKey::Control,
            kind: KeyEventKind::Up,
        },
    ]
}

fn clipboard_utf16_payload(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(test)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ClipboardRestoreAction {
    Clear,
    RestoreText,
    RestoreOleDataObject,
}

enum ClipboardSnapshot {
    Empty,
    Text(String),
    #[cfg(test)]
    NonText,
    OleDataObject(IDataObject),
}

impl ClipboardSnapshot {
    fn capture() -> Result<Self, PlatformError> {
        let _clipboard = OpenClipboardGuard::open()?;
        if unsafe { CountClipboardFormats() } == 0 {
            return Ok(Self::Empty);
        }
        drop(_clipboard);

        if let Ok(data_object) = unsafe { OleGetClipboard() } {
            return Ok(Self::OleDataObject(data_object));
        }

        let _clipboard = OpenClipboardGuard::open()?;
        if let Some(value) = read_clipboard_text() {
            Ok(Self::Text(value))
        } else {
            Err(PlatformError::new(
                "clipboard_failed",
                "failed to capture non-text clipboard contents",
            ))
        }
    }

    fn restore(self) {
        match self {
            Self::Empty => {
                let _ = clear_clipboard();
            }
            Self::Text(value) => {
                let _ = set_clipboard_text(&value);
            }
            #[cfg(test)]
            Self::NonText => {}
            Self::OleDataObject(data_object) => {
                let _ = unsafe { OleSetClipboard(&data_object) }
                    .map_err(|err| windows_error("OleSetClipboard", err));
            }
        }
    }

    #[cfg(test)]
    fn restore_action(&self) -> ClipboardRestoreAction {
        match self {
            Self::Empty => ClipboardRestoreAction::Clear,
            Self::Text(_) => ClipboardRestoreAction::RestoreText,
            Self::NonText | Self::OleDataObject(_) => ClipboardRestoreAction::RestoreOleDataObject,
        }
    }
}

struct OpenClipboardGuard;

impl OpenClipboardGuard {
    fn open() -> Result<Self, PlatformError> {
        unsafe { OpenClipboard(HWND(0)) }.map_err(|err| windows_error("OpenClipboard", err))?;
        Ok(Self)
    }
}

impl Drop for OpenClipboardGuard {
    fn drop(&mut self) {
        let _ = unsafe { CloseClipboard() };
    }
}

fn read_clipboard_text() -> Option<String> {
    if unsafe { IsClipboardFormatAvailable(CF_UNICODETEXT_ID) }.is_err() {
        return None;
    }

    let handle = unsafe { GetClipboardData(CF_UNICODETEXT_ID) }.ok()?;
    if handle.is_invalid() {
        return None;
    }
    let handle = HGLOBAL(handle.0 as *mut _);

    let size = unsafe { GlobalSize(handle) };
    if size == 0 {
        return None;
    }

    let locked = unsafe { GlobalLock(handle) };
    if locked.is_null() {
        return None;
    }

    let units = size / size_of::<u16>();
    let slice = unsafe { std::slice::from_raw_parts(locked.cast::<u16>(), units) };
    let end = slice
        .iter()
        .position(|unit| *unit == 0)
        .unwrap_or(slice.len());
    let value = String::from_utf16_lossy(&slice[..end]);
    let _ = unsafe { GlobalUnlock(handle) };
    Some(value)
}

fn clear_clipboard() -> Result<(), PlatformError> {
    let _clipboard = OpenClipboardGuard::open()?;
    unsafe { EmptyClipboard() }.map_err(|err| windows_error("EmptyClipboard", err))
}

fn set_clipboard_text(text: &str) -> Result<(), PlatformError> {
    let _clipboard = OpenClipboardGuard::open()?;
    let payload = clipboard_utf16_payload(text);
    let byte_len = size_of_val(payload.as_slice());
    let handle = unsafe { GlobalAlloc(GMEM_MOVEABLE, byte_len) }
        .map_err(|err| windows_error("GlobalAlloc", err))?;
    let locked = unsafe { GlobalLock(handle) };
    if locked.is_null() {
        unsafe {
            let _ = GlobalFree(handle);
        }
        return Err(PlatformError::new(
            "clipboard_failed",
            "failed to lock clipboard memory",
        ));
    }

    unsafe {
        copy_nonoverlapping(payload.as_ptr().cast::<u8>(), locked.cast::<u8>(), byte_len);
        let _ = GlobalUnlock(handle);
    }

    unsafe { EmptyClipboard() }.map_err(|err| windows_error("EmptyClipboard", err))?;
    let clipboard_handle = HANDLE(handle.0 as isize);
    if unsafe { SetClipboardData(CF_UNICODETEXT_ID, clipboard_handle) }.is_err() {
        unsafe {
            let _ = GlobalFree(handle);
        }
        return Err(PlatformError::new(
            "clipboard_failed",
            "failed to set clipboard text",
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::common::FocusedFieldInfo;

    fn focused_field(stable_id: &str) -> FocusedFieldInfo {
        FocusedFieldInfo {
            window_title: String::new(),
            control_name: String::new(),
            control_type: "Edit".to_string(),
            control_type_id: 50004,
            automation_id: String::new(),
            framework_id: String::new(),
            class_name: String::new(),
            current_value: String::new(),
            native_window_handle: 0,
            stable_id: stable_id.to_string(),
        }
    }

    #[test]
    fn strategy_selection_prefers_clipboard_then_send_input_for_active_caret_targets() {
        let candidate = FocusCandidateDiagnostics::for_test("caret-owner")
            .with_control_type("Document", 50030)
            .with_keyboard_focus(true)
            .with_keyboard_focusable(true)
            .with_text_pattern2(true)
            .with_active_caret(true);

        assert_eq!(
            insertion_plan(&candidate),
            vec![
                InsertionStrategy::ClipboardPaste,
                InsertionStrategy::SendInput,
            ]
        );
    }

    #[test]
    fn strategy_selection_uses_value_pattern_only_for_simple_controls() {
        let candidate = FocusCandidateDiagnostics::for_test("simple-input")
            .with_control_type("Edit", 50004)
            .with_value_pattern(true)
            .with_read_only(false);

        assert_eq!(
            insertion_plan(&candidate),
            vec![InsertionStrategy::UiaValuePattern]
        );
    }

    #[test]
    fn strategy_selection_prefers_send_input_for_terminal_surfaces() {
        let candidate = FocusCandidateDiagnostics::for_test("terminal")
            .with_control_type("Pane", 50033)
            .with_keyboard_focus(true)
            .with_keyboard_focusable(true)
            .with_framework_id("Win32")
            .with_class_name("CASCADIA_HOSTING_WINDOW_CLASS")
            .with_control_name("Windows Terminal");

        assert_eq!(
            insertion_plan(&candidate),
            vec![InsertionStrategy::SendInput]
        );
    }

    #[test]
    fn strategy_selection_prefers_send_input_for_terminal_text_leaf() {
        let candidate = FocusCandidateDiagnostics::for_test("termcontrol-leaf")
            .with_control_type("Text", 50020)
            .with_keyboard_focus(true)
            .with_keyboard_focusable(true)
            .with_text_pattern(true)
            .with_framework_id("XAML")
            .with_class_name("TermControl")
            .with_control_name("PowerShell");

        assert_eq!(
            insertion_plan(&candidate),
            vec![InsertionStrategy::SendInput]
        );
    }

    #[test]
    fn strategy_selection_prefers_send_input_for_chromium_terminal_helper_textarea() {
        let candidate = FocusCandidateDiagnostics::for_test("xterm-helper")
            .with_control_type("Edit", 50004)
            .with_keyboard_focus(true)
            .with_keyboard_focusable(true)
            .with_value_pattern(true)
            .with_text_pattern(true)
            .with_framework_id("Chrome")
            .with_class_name("xterm-helper-textarea")
            .with_control_name("pwsh");

        assert_eq!(
            insertion_plan(&candidate),
            vec![InsertionStrategy::SendInput]
        );
    }

    #[test]
    fn target_changed_payload_captures_original_and_current_targets() {
        let captured = FocusCandidateDiagnostics::for_test("captured")
            .with_window_title("CRM")
            .with_control_type("Edit", 50004)
            .with_value_pattern(true)
            .with_read_only(false);
        let current = FocusCandidateDiagnostics::for_test("current")
            .with_window_title("Visual Studio Code")
            .with_control_type("Document", 50030)
            .with_text_pattern2(true)
            .with_active_caret(true)
            .with_selected_strategy(InsertionStrategy::ClipboardPaste);

        let payload = LogPayload::target_changed("insert-7", "captured", &captured, &current);
        let json = serde_json::to_value(payload).expect("payload should serialize");

        assert_eq!(json["event"], "insert_target_changed");
        assert_eq!(json["operationId"], "insert-7");
        assert_eq!(json["capturedStableId"], "captured");
        assert_eq!(json["stableId"], "current");
        assert_eq!(json["windowTitle"], "Visual Studio Code");
    }

    #[test]
    fn captured_target_match_accepts_exact_stable_id() {
        let captured = focused_field("window:42/control:message-input");
        let current = focused_field("window:42/control:message-input");

        assert!(captured_target_matches(&captured, &current));
    }

    #[test]
    fn captured_target_match_accepts_same_automation_target() {
        let mut captured = focused_field("42:message-input");
        captured.native_window_handle = 42;
        captured.automation_id = "message-input".to_string();

        let mut current = focused_field("42:renamed-wrapper:50004");
        current.native_window_handle = 42;
        current.automation_id = "message-input".to_string();

        assert!(captured_target_matches(&captured, &current));
    }

    #[test]
    fn captured_target_match_accepts_terminal_when_uia_handle_identity_drifts() {
        let mut captured = focused_field("328920:Windows.UI.Input.InputSite.WindowClass:50020");
        captured.window_title = "youtube_cooking".to_string();
        captured.control_name = "PowerShell".to_string();
        captured.control_type = "Text".to_string();
        captured.control_type_id = 50020;
        captured.framework_id = "XAML".to_string();
        captured.class_name = "Windows.UI.Input.InputSite.WindowClass".to_string();
        captured.native_window_handle = 328920;

        let mut current = focused_field("0:TermControl:50020");
        current.window_title = "youtube_cooking".to_string();
        current.control_name = "PowerShell".to_string();
        current.control_type = "Text".to_string();
        current.control_type_id = 50020;
        current.framework_id = "XAML".to_string();
        current.class_name = "TermControl".to_string();

        assert!(captured_target_matches(&captured, &current));
    }

    #[test]
    fn captured_target_match_rejects_different_terminal_window() {
        let mut captured = focused_field("328920:Windows.UI.Input.InputSite.WindowClass:50020");
        captured.window_title = "youtube_cooking".to_string();
        captured.control_name = "PowerShell".to_string();
        captured.control_type_id = 50020;
        captured.class_name = "TermControl".to_string();

        let mut current = focused_field("99100:Windows.UI.Input.InputSite.WindowClass:50020");
        current.window_title = "admin_shell".to_string();
        current.control_name = "PowerShell".to_string();
        current.control_type_id = 50020;
        current.class_name = "TermControl".to_string();

        assert!(!captured_target_matches(&captured, &current));
    }

    #[test]
    fn clipboard_restore_action_preserves_non_text_snapshots() {
        assert_eq!(
            ClipboardSnapshot::NonText.restore_action(),
            ClipboardRestoreAction::RestoreOleDataObject
        );
    }

    #[test]
    fn clipboard_restore_action_clears_empty_clipboard() {
        assert_eq!(
            ClipboardSnapshot::Empty.restore_action(),
            ClipboardRestoreAction::Clear
        );
    }

    #[test]
    fn send_input_delivery_requires_every_event() {
        assert!(send_input_delivery_result(4, 4).is_ok());

        let err = send_input_delivery_result(3, 4).unwrap_err();

        assert_eq!(err.code, "send_input_failed");
    }

    #[test]
    fn send_input_verification_is_required_for_browser_editor_targets() {
        let candidate = FocusCandidateDiagnostics::for_test("chrome-editor")
            .with_control_type("Document", 50030)
            .with_keyboard_focus(true)
            .with_keyboard_focusable(true)
            .with_text_pattern2(true)
            .with_active_caret(true)
            .with_framework_id("Chrome")
            .with_class_name("Chrome_RenderWidgetHostHWND");

        assert!(should_verify_send_input(&candidate));
    }

    #[test]
    fn send_input_verification_is_skipped_for_terminal_targets() {
        let candidate = FocusCandidateDiagnostics::for_test("terminal")
            .with_control_type("Text", 50020)
            .with_keyboard_focus(true)
            .with_keyboard_focusable(true)
            .with_text_pattern(true)
            .with_framework_id("XAML")
            .with_class_name("TermControl")
            .with_control_name("PowerShell");

        assert!(!should_verify_send_input(&candidate));
    }

    #[test]
    fn clipboard_payload_is_utf16_with_null_terminator() {
        assert_eq!(
            clipboard_utf16_payload("hi"),
            vec![b'h' as u16, b'i' as u16, 0],
        );
    }

    #[test]
    fn paste_shortcut_sends_ctrl_v_chord() {
        let inputs = paste_shortcut_inputs();

        assert_eq!(inputs.len(), 4);
        assert_eq!(inputs[0].kind, KeyEventKind::Down);
        assert_eq!(inputs[0].key, PasteKey::Control);
        assert_eq!(inputs[1].kind, KeyEventKind::Down);
        assert_eq!(inputs[1].key, PasteKey::V);
        assert_eq!(inputs[2].kind, KeyEventKind::Up);
        assert_eq!(inputs[2].key, PasteKey::V);
        assert_eq!(inputs[3].kind, KeyEventKind::Up);
        assert_eq!(inputs[3].key, PasteKey::Control);
    }

    #[test]
    fn paste_readback_requires_visible_inserted_text() {
        assert!(text_readback_confirms_insert(
            "",
            "hello browser",
            "hello browser"
        ));
        assert!(!text_readback_confirms_insert("hello", "hello", "hello"));
        assert!(text_readback_confirms_insert(
            "existing",
            "existing hello",
            "hello"
        ));
        assert!(!text_readback_confirms_insert("", "", "hello"));
        assert!(!text_readback_confirms_insert(
            "existing", "existing", "hello"
        ));
    }
}
