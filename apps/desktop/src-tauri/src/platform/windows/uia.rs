use crate::platform::common::PlatformError;
use crate::platform::windows::errors::windows_error;
use windows::core::{BSTR, Interface};
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationTextPattern,
    IUIAutomationValuePattern, UIA_ButtonControlTypeId, UIA_ComboBoxControlTypeId,
    UIA_CustomControlTypeId, UIA_DocumentControlTypeId, UIA_EditControlTypeId,
    UIA_ListControlTypeId, UIA_ListItemControlTypeId, UIA_PaneControlTypeId,
    UIA_TextControlTypeId, UIA_TextPatternId, UIA_TreeItemControlTypeId,
    UIA_ValuePatternId,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetAncestor, GetWindowTextLengthW, GetWindowTextW, GA_ROOTOWNER,
};

pub(crate) fn create_automation() -> Result<IUIAutomation, PlatformError> {
    unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) }
        .map_err(|err| windows_error("CoCreateInstance(CUIAutomation)", err))
}

pub(crate) fn get_focused_element(
    automation: &IUIAutomation,
) -> Result<IUIAutomationElement, PlatformError> {
    unsafe { automation.GetFocusedElement() }
        .map_err(|err| windows_error("GetFocusedElement", err))
}

pub(crate) fn bstr_to_string(value: windows::core::Result<BSTR>) -> String {
    match value {
        Ok(bstr) => bstr.to_string(),
        Err(_) => String::new(),
    }
}

pub(crate) fn window_title_from_handle(native_handle: HWND) -> String {
    if native_handle.0 == 0 {
        return String::new();
    }

    let hwnd = native_handle;
    let mut title = get_window_text(hwnd);
    if title.is_empty() {
        let root = unsafe { GetAncestor(hwnd, GA_ROOTOWNER) };
        if root.0 != 0 {
            title = get_window_text(root);
        }
    }

    title
}

pub(crate) fn control_type_to_string(control_type_id: i32) -> String {
    match control_type_id {
        id if id == UIA_EditControlTypeId.0 => "Edit".to_string(),
        id if id == UIA_DocumentControlTypeId.0 => "Document".to_string(),
        id if id == UIA_TextControlTypeId.0 => "Text".to_string(),
        id if id == UIA_PaneControlTypeId.0 => "Pane".to_string(),
        id if id == UIA_ComboBoxControlTypeId.0 => "ComboBox".to_string(),
        id if id == UIA_ListItemControlTypeId.0 => "ListItem".to_string(),
        id if id == UIA_ListControlTypeId.0 => "List".to_string(),
        id if id == UIA_ButtonControlTypeId.0 => "Button".to_string(),
        id if id == UIA_TreeItemControlTypeId.0 => "TreeItem".to_string(),
        id if id == UIA_CustomControlTypeId.0 => "Custom".to_string(),
        _ => format!("ControlType({})", control_type_id),
    }
}

pub(crate) fn get_current_value(element: &IUIAutomationElement) -> String {
    if let Some(value) = get_value_pattern_text(element) {
        return value;
    }

    if let Some(value) = get_text_pattern_text(element) {
        return value;
    }

    String::new()
}

fn get_window_text(hwnd: HWND) -> String {
    let length = unsafe { GetWindowTextLengthW(hwnd) };
    if length == 0 {
        return String::new();
    }

    let mut buffer: Vec<u16> = vec![0; (length + 1) as usize];
    let copied = unsafe { GetWindowTextW(hwnd, &mut buffer) };
    if copied == 0 {
        return String::new();
    }

    String::from_utf16_lossy(&buffer[..copied as usize])
}

fn get_value_pattern_text(element: &IUIAutomationElement) -> Option<String> {
    let pattern = unsafe { element.GetCurrentPattern(UIA_ValuePatternId) }.ok()?;
    let value_pattern = pattern.cast::<IUIAutomationValuePattern>().ok()?;
    let value = unsafe { value_pattern.CurrentValue() }.ok()?;
    let text = bstr_to_string(Ok(value));
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

fn get_text_pattern_text(element: &IUIAutomationElement) -> Option<String> {
    let pattern = unsafe { element.GetCurrentPattern(UIA_TextPatternId) }.ok()?;
    let text_pattern = pattern.cast::<IUIAutomationTextPattern>().ok()?;
    let range = unsafe { text_pattern.DocumentRange() }.ok()?;
    let text = unsafe { range.GetText(2000) }.ok()?;
    let text = bstr_to_string(Ok(text));
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}
