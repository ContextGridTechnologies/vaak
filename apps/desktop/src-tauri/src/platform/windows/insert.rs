use crate::platform::common::{CaptureInsertResult, PlatformError, TextInsertResult};
use crate::platform::windows::com::ComInit;
use crate::platform::windows::focus::build_focused_field_info;
use crate::platform::windows::uia::{create_automation, get_focused_element};
use std::mem::size_of;
use windows::core::{BSTR, Interface};
use windows::Win32::UI::Accessibility::{
    IUIAutomationElement, IUIAutomationValuePattern, UIA_ValuePatternId,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE,
    VIRTUAL_KEY,
};

pub(crate) fn insert_text(text: &str) -> Result<TextInsertResult, PlatformError> {
    let _com = ComInit::new()?;
    let automation = create_automation()?;
    let element = get_focused_element(&automation)?;
    insert_text_for_element(&element, text)
}

pub(crate) fn capture_and_insert(text: &str) -> Result<CaptureInsertResult, PlatformError> {
    let _com = ComInit::new()?;
    let automation = create_automation()?;
    let element = get_focused_element(&automation)?;
    let field = build_focused_field_info(&element);
    let insert = insert_text_for_element(&element, text)?;

    Ok(CaptureInsertResult { field, insert })
}

fn insert_text_for_element(
    element: &IUIAutomationElement,
    text: &str,
) -> Result<TextInsertResult, PlatformError> {
    if text.is_empty() {
        return Ok(TextInsertResult {
            method: "noop".to_string(),
            characters: 0,
        });
    }

    if let Ok(pattern) = unsafe { element.GetCurrentPattern(UIA_ValuePatternId) } {
        if let Ok(value_pattern) = pattern.cast::<IUIAutomationValuePattern>() {
            let read_only = unsafe { value_pattern.CurrentIsReadOnly() }
                .map(|value| value.as_bool())
                .unwrap_or(false);
            if !read_only {
                let value = BSTR::from(text);
                if unsafe { value_pattern.SetValue(&value) }.is_ok() {
                    return Ok(TextInsertResult {
                        method: "uia_valuepattern".to_string(),
                        characters: text.chars().count(),
                    });
                }
            }
        }
    }

    let _ = unsafe { element.SetFocus() };
    send_input_text(text)?;

    Ok(TextInsertResult {
        method: "send_input".to_string(),
        characters: text.chars().count(),
    })
}

fn send_input_text(text: &str) -> Result<(), PlatformError> {
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
    if sent == 0 {
        return Err(PlatformError::new(
            "send_input_failed",
            "SendInput returned zero",
        ));
    }

    Ok(())
}
