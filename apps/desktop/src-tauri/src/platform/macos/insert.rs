use crate::platform::common::{
    CaptureInsertResult, FocusedFieldInfo, PlatformError, TextInsertResult,
};
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};

#[cfg(all(target_os = "macos", not(test)))]
use super::focus::{focused_field_from_metadata, AxFocusedElementMetadata};

#[cfg(all(target_os = "macos", not(test)))]
use std::ffi::{c_void, CStr, CString};
#[cfg(all(target_os = "macos", not(test)))]
use std::os::raw::{c_char, c_int, c_uchar};
#[cfg(all(target_os = "macos", not(test)))]
use std::ptr;
#[cfg(all(target_os = "macos", not(test)))]
use std::{thread, time::Duration};

const CLIPBOARD_PASTE_METHOD: &str = "clipboard_paste";
const LOG_TARGET: &str = "vaak::platform::macos";
static NEXT_OPERATION_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
enum MacInsertionStrategy {
    ClipboardPaste,
}

impl MacInsertionStrategy {
    const fn as_method(self) -> &'static str {
        match self {
            Self::ClipboardPaste => CLIPBOARD_PASTE_METHOD,
        }
    }
}

#[derive(Clone, Debug)]
struct MacTargetDiagnostics {
    snapshot: FocusedFieldInfo,
    source: String,
    selected_strategy: Option<MacInsertionStrategy>,
    reason: Option<String>,
}

impl MacTargetDiagnostics {
    fn from_snapshot(snapshot: FocusedFieldInfo, source: &str) -> Self {
        Self {
            snapshot,
            source: source.to_string(),
            selected_strategy: None,
            reason: None,
        }
    }

    fn for_mismatch(stable_id: &str) -> Self {
        Self::from_snapshot(test_like_field(stable_id), "captured_target")
    }

    fn with_strategy(&self, strategy: MacInsertionStrategy) -> Self {
        let mut diagnostics = self.clone();
        diagnostics.selected_strategy = Some(strategy);
        diagnostics.reason = Some(macos_insertion_reason(&diagnostics.snapshot, strategy));
        diagnostics
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MacLogPayload {
    event: String,
    operation_id: String,
    window_title: String,
    stable_id: String,
    control_name: String,
    control_type: String,
    automation_id: String,
    framework_id: String,
    class_name: String,
    chosen_strategy: Option<String>,
    reason: Option<String>,
    error_code: Option<String>,
    error_message: Option<String>,
    captured_stable_id: Option<String>,
    candidate_source: String,
}

impl MacLogPayload {
    fn target_event(
        event: &str,
        operation_id: &str,
        diagnostics: &MacTargetDiagnostics,
        error: Option<&PlatformError>,
    ) -> Self {
        Self {
            event: event.to_string(),
            operation_id: operation_id.to_string(),
            window_title: diagnostics.snapshot.window_title.clone(),
            stable_id: diagnostics.snapshot.stable_id.clone(),
            control_name: diagnostics.snapshot.control_name.clone(),
            control_type: diagnostics.snapshot.control_type.clone(),
            automation_id: diagnostics.snapshot.automation_id.clone(),
            framework_id: diagnostics.snapshot.framework_id.clone(),
            class_name: diagnostics.snapshot.class_name.clone(),
            chosen_strategy: diagnostics
                .selected_strategy
                .map(MacInsertionStrategy::as_method)
                .map(ToOwned::to_owned),
            reason: diagnostics.reason.clone(),
            error_code: error.map(|value| value.code.clone()),
            error_message: error.map(|value| value.message.clone()),
            captured_stable_id: None,
            candidate_source: diagnostics.source.clone(),
        }
    }

    fn target_changed(
        operation_id: &str,
        captured_stable_id: &str,
        captured: &MacTargetDiagnostics,
        current: &MacTargetDiagnostics,
    ) -> Self {
        let mut payload = Self::target_event("insert_target_changed", operation_id, current, None);
        payload.captured_stable_id = Some(captured_stable_id.to_string());
        payload.reason = Some(format!(
            "captured target {} no longer matches focused target {}",
            captured.snapshot.stable_id, current.snapshot.stable_id
        ));
        payload
    }
}

pub(crate) fn insert_text(text: &str) -> Result<TextInsertResult, PlatformError> {
    let _operation_id = next_operation_id("insert");
    #[cfg(all(target_os = "macos", not(test)))]
    {
        let target = native::resolve_focused_target()?;
        log_target_event(
            "focus_target_selected",
            &_operation_id,
            &target.diagnostics,
            None,
        );
        insert_text_for_target(&_operation_id, text, target)
    }
    #[cfg(any(not(target_os = "macos"), test))]
    {
        insert_text_for_test(text)
    }
}

pub(crate) fn insert_text_for_stable_id(
    text: &str,
    stable_id: &str,
) -> Result<TextInsertResult, PlatformError> {
    let _operation_id = next_operation_id("insert");
    #[cfg(all(target_os = "macos", not(test)))]
    {
        let target = native::resolve_focused_target()?;
        log_target_event(
            "focus_target_selected",
            &_operation_id,
            &target.diagnostics,
            None,
        );
        ensure_stable_target(&_operation_id, stable_id, &target.diagnostics)?;
        insert_text_for_target(&_operation_id, text, target)
    }
    #[cfg(any(not(target_os = "macos"), test))]
    {
        let _ = stable_id;
        insert_text_for_test(text)
    }
}

pub(crate) fn insert_text_for_captured_target(
    text: &str,
    captured: &FocusedFieldInfo,
) -> Result<TextInsertResult, PlatformError> {
    let operation_id = next_operation_id("insert");
    #[cfg(all(target_os = "macos", not(test)))]
    {
        let target = native::resolve_focused_target()?;
        log_target_event(
            "focus_target_selected",
            &operation_id,
            &target.diagnostics,
            None,
        );
        ensure_captured_target(&operation_id, captured, &target.diagnostics)?;
        insert_text_for_target(&operation_id, text, target)
    }
    #[cfg(any(not(target_os = "macos"), test))]
    {
        let current = captured.clone();
        let current = MacTargetDiagnostics::from_snapshot(current, "focused_element");
        ensure_captured_target(&operation_id, captured, &current)?;
        insert_text_for_test(text)
    }
}

pub(crate) fn capture_and_insert(text: &str) -> Result<CaptureInsertResult, PlatformError> {
    let _operation_id = next_operation_id("insert");
    #[cfg(all(target_os = "macos", not(test)))]
    {
        let target = native::resolve_focused_target()?;
        log_target_event(
            "focus_target_selected",
            &_operation_id,
            &target.diagnostics,
            None,
        );
        let field = target.diagnostics.snapshot.clone();
        let insert = insert_text_for_target(&_operation_id, text, target)?;
        Ok(CaptureInsertResult { field, insert })
    }
    #[cfg(any(not(target_os = "macos"), test))]
    {
        let field = test_field("macos:ax:1:field:Field:AXTextField:");
        let insert = insert_text_for_test(text)?;
        Ok(CaptureInsertResult { field, insert })
    }
}

#[cfg(all(target_os = "macos", not(test)))]
fn insert_text_for_target(
    operation_id: &str,
    text: &str,
    target: native::ResolvedMacTarget,
) -> Result<TextInsertResult, PlatformError> {
    if text.is_empty() {
        return Ok(noop_result());
    }

    log_target_event("insert_started", operation_id, &target.diagnostics, None);

    for strategy in macos_insertion_plan(&target.diagnostics.snapshot) {
        let planned = target.diagnostics.with_strategy(strategy);
        log_target_event("insert_strategy_attempted", operation_id, &planned, None);

        let result = match strategy {
            MacInsertionStrategy::ClipboardPaste => native::paste_text_into_target(text, &target),
        };

        match result {
            Ok(()) => {
                log_target_event("insert_strategy_succeeded", operation_id, &planned, None);
                return Ok(TextInsertResult {
                    method: strategy.as_method().to_string(),
                    characters: text.chars().count(),
                });
            }
            Err(err) => {
                log_target_event("insert_strategy_failed", operation_id, &planned, Some(&err));
            }
        }
    }

    Err(PlatformError::new(
        "insert_failed",
        "No supported insertion strategy succeeded for the focused target",
    ))
}

#[cfg(any(not(target_os = "macos"), test))]
fn insert_text_for_test(text: &str) -> Result<TextInsertResult, PlatformError> {
    if text.is_empty() {
        return Ok(noop_result());
    }

    Ok(TextInsertResult {
        method: macos_insertion_plan(&test_field("macos:ax:1:field:Field:AXTextField:"))
            .first()
            .map(|strategy| strategy.as_method())
            .unwrap_or(CLIPBOARD_PASTE_METHOD)
            .to_string(),
        characters: text.chars().count(),
    })
}

fn noop_result() -> TextInsertResult {
    TextInsertResult {
        method: "noop".to_string(),
        characters: 0,
    }
}

fn ensure_stable_target(
    operation_id: &str,
    stable_id: &str,
    current: &MacTargetDiagnostics,
) -> Result<(), PlatformError> {
    if current.snapshot.stable_id == stable_id {
        return Ok(());
    }

    let captured = MacTargetDiagnostics::for_mismatch(stable_id);
    log::warn!(
        target: LOG_TARGET,
        "{}",
        serialize_log_payload(MacLogPayload::target_changed(
            operation_id,
            stable_id,
            &captured,
            current,
        ))
    );

    Err(target_changed())
}

fn ensure_captured_target(
    operation_id: &str,
    captured: &FocusedFieldInfo,
    current: &MacTargetDiagnostics,
) -> Result<(), PlatformError> {
    if captured_target_matches(captured, &current.snapshot) {
        return Ok(());
    }

    let captured_diagnostics =
        MacTargetDiagnostics::from_snapshot(captured.clone(), "captured_target");
    log::warn!(
        target: LOG_TARGET,
        "{}",
        serialize_log_payload(MacLogPayload::target_changed(
            operation_id,
            &captured.stable_id,
            &captured_diagnostics,
            current,
        ))
    );

    Err(target_changed())
}

fn captured_target_matches(captured: &FocusedFieldInfo, current: &FocusedFieldInfo) -> bool {
    if current.stable_id == captured.stable_id {
        return true;
    }

    same_macos_process(captured, current)
        && same_non_empty_window_title(captured, current)
        && current.control_type == captured.control_type
        && !captured.automation_id.is_empty()
        && current.automation_id == captured.automation_id
        && current.framework_id == "AX"
        && captured.framework_id == "AX"
}

fn same_macos_process(captured: &FocusedFieldInfo, current: &FocusedFieldInfo) -> bool {
    let Some(captured_pid) = macos_process_id_from_stable_id(&captured.stable_id) else {
        return false;
    };
    let Some(current_pid) = macos_process_id_from_stable_id(&current.stable_id) else {
        return false;
    };

    captured_pid == current_pid
}

fn same_non_empty_window_title(captured: &FocusedFieldInfo, current: &FocusedFieldInfo) -> bool {
    !captured.window_title.is_empty() && captured.window_title == current.window_title
}

fn macos_process_id_from_stable_id(stable_id: &str) -> Option<i32> {
    stable_id
        .strip_prefix("macos:ax:")?
        .split(':')
        .next()?
        .parse()
        .ok()
}

fn target_changed() -> PlatformError {
    PlatformError::new("target_changed", "Focused field changed before insertion")
}

fn macos_insertion_plan(field: &FocusedFieldInfo) -> Vec<MacInsertionStrategy> {
    let _ = field;
    vec![MacInsertionStrategy::ClipboardPaste]
}

fn macos_insertion_reason(_field: &FocusedFieldInfo, strategy: MacInsertionStrategy) -> String {
    match strategy {
        MacInsertionStrategy::ClipboardPaste => {
            "clipboard paste preserves caret insertion without replacing existing AX text"
                .to_string()
        }
    }
}

fn next_operation_id(prefix: &str) -> String {
    let value = NEXT_OPERATION_ID.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}-{value}")
}

fn log_target_event(
    event: &str,
    operation_id: &str,
    diagnostics: &MacTargetDiagnostics,
    error: Option<&PlatformError>,
) {
    log::info!(
        target: LOG_TARGET,
        "{}",
        serialize_log_payload(MacLogPayload::target_event(
            event,
            operation_id,
            diagnostics,
            error,
        ))
    );
}

fn serialize_log_payload(payload: MacLogPayload) -> String {
    serde_json::to_string(&payload).unwrap_or_else(|err| {
        format!(
            "{{\"event\":\"log_serialization_failed\",\"message\":\"{}\"}}",
            err
        )
    })
}

fn test_like_field(stable_id: &str) -> FocusedFieldInfo {
    FocusedFieldInfo {
        window_title: String::new(),
        control_name: String::new(),
        control_type: String::new(),
        control_type_id: 0,
        automation_id: String::new(),
        framework_id: String::new(),
        class_name: String::new(),
        current_value: String::new(),
        native_window_handle: 0,
        stable_id: stable_id.to_string(),
    }
}

#[cfg(any(not(target_os = "macos"), test))]
fn test_field(stable_id: &str) -> FocusedFieldInfo {
    FocusedFieldInfo {
        window_title: "Notes".to_string(),
        control_name: "Field".to_string(),
        control_type: "AXTextField".to_string(),
        control_type_id: 0,
        automation_id: "field".to_string(),
        framework_id: "AX".to_string(),
        class_name: String::new(),
        current_value: String::new(),
        native_window_handle: 0,
        stable_id: stable_id.to_string(),
    }
}

#[cfg(all(target_os = "macos", not(test)))]
#[allow(clashing_extern_declarations)] // objc_msgSend is typed per selector/return shape.
mod native {
    use super::*;

    type AXError = i32;
    type AXUIElementRef = *const c_void;
    type CFAllocatorRef = *const c_void;
    type CFIndex = isize;
    type CFStringEncoding = u32;
    type CFStringRef = *const c_void;
    type CFTypeID = usize;
    type CFTypeRef = *const c_void;
    type CGEventRef = *const c_void;
    type CGEventSourceRef = *const c_void;
    type CGKeyCode = u16;
    type Id = *mut c_void;
    type PidT = c_int;
    type Sel = *mut c_void;

    const K_AX_ERROR_SUCCESS: AXError = 0;
    const K_AX_ERROR_ATTRIBUTE_UNSUPPORTED: AXError = -25205;
    const K_AX_ERROR_NO_VALUE: AXError = -25212;
    const K_CF_STRING_ENCODING_UTF8: CFStringEncoding = 0x0800_0100;
    const K_CG_EVENT_FLAG_MASK_COMMAND: u64 = 0x0010_0000;
    const K_CG_HID_EVENT_TAP: u32 = 0;
    const V_KEY_CODE: CGKeyCode = 9;
    const PASTEBOARD_RESTORE_DELAY: Duration = Duration::from_millis(120);

    #[link(name = "ApplicationServices", kind = "framework")]
    unsafe extern "C" {
        fn AXUIElementCreateApplication(pid: PidT) -> AXUIElementRef;
        fn AXUIElementCreateSystemWide() -> AXUIElementRef;
        fn AXUIElementCopyAttributeValue(
            element: AXUIElementRef,
            attribute: CFStringRef,
            value: *mut CFTypeRef,
        ) -> AXError;
        fn AXUIElementGetPid(element: AXUIElementRef, pid: *mut PidT) -> AXError;
        fn AXUIElementPerformAction(element: AXUIElementRef, action: CFStringRef) -> AXError;
        fn AXUIElementSetAttributeValue(
            element: AXUIElementRef,
            attribute: CFStringRef,
            value: CFTypeRef,
        ) -> AXError;
        fn CGEventCreateKeyboardEvent(
            source: CGEventSourceRef,
            virtual_key: CGKeyCode,
            key_down: bool,
        ) -> CGEventRef;
        fn CGEventPost(tap: u32, event: CGEventRef);
        fn CGEventSetFlags(event: CGEventRef, flags: u64);
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFGetTypeID(cf: CFTypeRef) -> CFTypeID;
        fn CFRelease(cf: CFTypeRef);
        fn CFStringCreateWithCString(
            alloc: CFAllocatorRef,
            c_str: *const c_char,
            encoding: CFStringEncoding,
        ) -> CFStringRef;
        fn CFStringGetCString(
            the_string: CFStringRef,
            buffer: *mut c_char,
            buffer_size: CFIndex,
            encoding: CFStringEncoding,
        ) -> c_uchar;
        fn CFStringGetLength(the_string: CFStringRef) -> CFIndex;
        fn CFStringGetMaximumSizeForEncoding(
            length: CFIndex,
            encoding: CFStringEncoding,
        ) -> CFIndex;
        fn CFStringGetTypeID() -> CFTypeID;
        static kCFBooleanTrue: CFTypeRef;
    }

    #[link(name = "AppKit", kind = "framework")]
    unsafe extern "C" {}

    #[link(name = "objc")]
    unsafe extern "C" {
        fn objc_getClass(name: *const c_char) -> Id;
        fn sel_registerName(name: *const c_char) -> Sel;
        #[link_name = "objc_msgSend"]
        fn objc_msg_send_id(receiver: Id, selector: Sel) -> Id;
        #[link_name = "objc_msgSend"]
        fn objc_msg_send_cstr(receiver: Id, selector: Sel, value: *const c_char) -> Id;
        #[link_name = "objc_msgSend"]
        fn objc_msg_send_data_for_type(receiver: Id, selector: Sel, value: Id) -> Id;
        #[link_name = "objc_msgSend"]
        fn objc_msg_send_set_string(receiver: Id, selector: Sel, value: Id, value_type: Id)
            -> bool;
        #[link_name = "objc_msgSend"]
        fn objc_msg_send_set_data(receiver: Id, selector: Sel, value: Id, value_type: Id) -> bool;
        #[link_name = "objc_msgSend"]
        fn objc_msg_send_clear(receiver: Id, selector: Sel) -> isize;
        #[link_name = "objc_msgSend"]
        fn objc_msg_send_count(receiver: Id, selector: Sel) -> usize;
        #[link_name = "objc_msgSend"]
        fn objc_msg_send_object_at_index(receiver: Id, selector: Sel, index: usize) -> Id;
        #[link_name = "objc_msgSend"]
        fn objc_msg_send_retain(receiver: Id, selector: Sel) -> Id;
        #[link_name = "objc_msgSend"]
        fn objc_msg_send_release(receiver: Id, selector: Sel);
    }

    pub(super) struct ResolvedMacTarget {
        pub diagnostics: MacTargetDiagnostics,
        element: RetainedAxElement,
        window: Option<RetainedAxElement>,
        process_id: i32,
    }

    pub(super) fn resolve_focused_target() -> Result<ResolvedMacTarget, PlatformError> {
        let system = unsafe { AXUIElementCreateSystemWide() };
        if system.is_null() {
            return Err(macos_error("failed to create system-wide AX element"));
        }
        let system = RetainedAxElement::new(system as CFTypeRef);

        let focused = match copy_attribute(system.as_ptr(), "AXFocusedUIElement")? {
            Some(value) => RetainedAxElement::new(value),
            None => return Err(no_focused_target()),
        };

        let process_id = ax_process_id(focused.as_ptr())?;
        let window = copy_attribute(focused.as_ptr(), "AXWindow")?.map(RetainedAxElement::new);
        let window_title = match &window {
            Some(window) => copy_string_attribute(window.as_ptr(), "AXTitle")?,
            None => None,
        };
        let metadata = AxFocusedElementMetadata {
            process_id,
            window_title,
            title: copy_string_attribute(focused.as_ptr(), "AXTitle")?,
            role: copy_string_attribute(focused.as_ptr(), "AXRole")?,
            subrole: copy_string_attribute(focused.as_ptr(), "AXSubrole")?,
            identifier: copy_string_attribute(focused.as_ptr(), "AXIdentifier")?,
            value: copy_string_attribute(focused.as_ptr(), "AXValue")?,
        };
        let field = focused_field_from_metadata(Some(metadata))?;
        let diagnostics = MacTargetDiagnostics::from_snapshot(field, "focused_element");

        Ok(ResolvedMacTarget {
            diagnostics,
            element: focused,
            window,
            process_id,
        })
    }

    pub(super) fn paste_text_into_target(
        text: &str,
        target: &ResolvedMacTarget,
    ) -> Result<(), PlatformError> {
        let previous = PasteboardSnapshot::capture();
        set_pasteboard_text(text)?;
        focus_target(&target)?;
        send_command_v()?;
        thread::sleep(PASTEBOARD_RESTORE_DELAY);
        if let Some(previous) = previous {
            previous.restore();
        }
        Ok(())
    }

    fn focus_target(target: &ResolvedMacTarget) -> Result<(), PlatformError> {
        if let Some(window) = &target.window {
            perform_action(window.as_ptr(), "AXRaise");
        }

        let app = unsafe { AXUIElementCreateApplication(target.process_id as PidT) };
        if !app.is_null() {
            let app = RetainedAxElement::new(app as CFTypeRef);
            set_attribute(
                app.as_ptr(),
                "AXFocusedUIElement",
                target.element.as_ptr() as CFTypeRef,
            );
        }
        set_attribute(target.element.as_ptr(), "AXFocused", unsafe {
            kCFBooleanTrue
        });
        Ok(())
    }

    fn send_command_v() -> Result<(), PlatformError> {
        let down = unsafe { CGEventCreateKeyboardEvent(ptr::null(), V_KEY_CODE, true) };
        let up = unsafe { CGEventCreateKeyboardEvent(ptr::null(), V_KEY_CODE, false) };
        if down.is_null() || up.is_null() {
            return Err(macos_error("failed to create paste keyboard event"));
        }

        unsafe {
            CGEventSetFlags(down, K_CG_EVENT_FLAG_MASK_COMMAND);
            CGEventSetFlags(up, K_CG_EVENT_FLAG_MASK_COMMAND);
            CGEventPost(K_CG_HID_EVENT_TAP, down);
            CGEventPost(K_CG_HID_EVENT_TAP, up);
            CFRelease(down as CFTypeRef);
            CFRelease(up as CFTypeRef);
        }
        Ok(())
    }

    struct PasteboardSnapshot {
        items: Vec<PasteboardItem>,
    }

    impl PasteboardSnapshot {
        fn capture() -> Option<Self> {
            // Preserve every pasteboard flavor we can read, not just text. This
            // keeps image and rich-text clipboards intact after dictation paste.
            let pasteboard = general_pasteboard()?;
            let types = unsafe { objc_msg_send_id(pasteboard, selector("types")) };
            if types.is_null() {
                return Some(Self { items: Vec::new() });
            }

            let count = unsafe { objc_msg_send_count(types, selector("count")) };
            let mut items = Vec::with_capacity(count);
            for index in 0..count {
                let pasteboard_type = unsafe {
                    objc_msg_send_object_at_index(types, selector("objectAtIndex:"), index)
                };
                if pasteboard_type.is_null() {
                    continue;
                }
                let data = unsafe {
                    objc_msg_send_data_for_type(
                        pasteboard,
                        selector("dataForType:"),
                        pasteboard_type,
                    )
                };
                if data.is_null() {
                    continue;
                }

                items.push(PasteboardItem {
                    pasteboard_type: retain_id(pasteboard_type),
                    data: retain_id(data),
                });
            }

            Some(Self { items })
        }

        fn restore(self) {
            let Some(pasteboard) = general_pasteboard() else {
                return;
            };

            // Restore is deliberately best-effort; insertion has already
            // happened, and clipboard recovery should not surface as failure.
            unsafe {
                objc_msg_send_clear(pasteboard, selector("clearContents"));
            }
            for item in &self.items {
                unsafe {
                    if !objc_msg_send_set_data(
                        pasteboard,
                        selector("setData:forType:"),
                        item.data,
                        item.pasteboard_type,
                    ) {
                        log::warn!("failed to restore macOS pasteboard item");
                    }
                }
            }
        }
    }

    struct PasteboardItem {
        pasteboard_type: Id,
        data: Id,
    }

    impl Drop for PasteboardItem {
        fn drop(&mut self) {
            release_id(self.pasteboard_type);
            release_id(self.data);
        }
    }

    fn retain_id(value: Id) -> Id {
        unsafe { objc_msg_send_retain(value, selector("retain")) }
    }

    fn release_id(value: Id) {
        unsafe {
            objc_msg_send_release(value, selector("release"));
        }
    }

    fn set_pasteboard_text(text: &str) -> Result<(), PlatformError> {
        let Some(pasteboard) = general_pasteboard() else {
            return Err(macos_error("failed to access the general pasteboard"));
        };
        let pasteboard_type = ns_string("public.utf8-plain-text")?;
        let value = ns_string(text)?;

        unsafe {
            objc_msg_send_clear(pasteboard, selector("clearContents"));
            if !objc_msg_send_set_string(
                pasteboard,
                selector("setString:forType:"),
                value,
                pasteboard_type,
            ) {
                return Err(macos_error("failed to set pasteboard text"));
            }
        }

        Ok(())
    }

    fn general_pasteboard() -> Option<Id> {
        let class = class("NSPasteboard")?;
        let pasteboard = unsafe { objc_msg_send_id(class, selector("generalPasteboard")) };
        (!pasteboard.is_null()).then_some(pasteboard)
    }

    fn ns_string(value: &str) -> Result<Id, PlatformError> {
        let class = class("NSString").ok_or_else(|| macos_error("NSString class not found"))?;
        let c_value = CString::new(value)
            .map_err(|_| macos_error("failed to create CString for pasteboard value"))?;
        let value = unsafe {
            objc_msg_send_cstr(class, selector("stringWithUTF8String:"), c_value.as_ptr())
        };
        if value.is_null() {
            return Err(macos_error("failed to create NSString"));
        }
        Ok(value)
    }

    fn class(name: &'static str) -> Option<Id> {
        let name = CString::new(name).ok()?;
        let class = unsafe { objc_getClass(name.as_ptr()) };
        (!class.is_null()).then_some(class)
    }

    fn selector(name: &'static str) -> Sel {
        let name = CString::new(name).expect("selector names are static and contain no NUL bytes");
        unsafe { sel_registerName(name.as_ptr()) }
    }

    fn ax_process_id(element: AXUIElementRef) -> Result<i32, PlatformError> {
        let mut pid: PidT = 0;
        let error = unsafe { AXUIElementGetPid(element, &mut pid) };
        if error == K_AX_ERROR_SUCCESS {
            return Ok(pid);
        }

        Err(macos_error(format!(
            "AXUIElementGetPid failed with error {error}"
        )))
    }

    fn copy_string_attribute(
        element: AXUIElementRef,
        name: &'static str,
    ) -> Result<Option<String>, PlatformError> {
        let Some(value) = copy_attribute(element, name)? else {
            return Ok(None);
        };
        let value = RetainedCfType::new(value);

        if unsafe { CFGetTypeID(value.as_ptr()) } != unsafe { CFStringGetTypeID() } {
            return Ok(None);
        }

        Ok(cf_string_to_string(value.as_ptr() as CFStringRef))
    }

    fn copy_attribute(
        element: AXUIElementRef,
        name: &'static str,
    ) -> Result<Option<CFTypeRef>, PlatformError> {
        let attribute = CfString::new(name)?;
        let mut value: CFTypeRef = ptr::null();
        let error =
            unsafe { AXUIElementCopyAttributeValue(element, attribute.as_ptr(), &mut value) };

        match error {
            K_AX_ERROR_SUCCESS => {
                if value.is_null() {
                    Ok(None)
                } else {
                    Ok(Some(value))
                }
            }
            K_AX_ERROR_ATTRIBUTE_UNSUPPORTED | K_AX_ERROR_NO_VALUE => Ok(None),
            _ => Err(macos_error(format!(
                "AXUIElementCopyAttributeValue({name}) failed with error {error}"
            ))),
        }
    }

    fn set_attribute(element: AXUIElementRef, name: &'static str, value: CFTypeRef) {
        if let Ok(attribute) = CfString::new(name) {
            let error = unsafe { AXUIElementSetAttributeValue(element, attribute.as_ptr(), value) };
            if error != K_AX_ERROR_SUCCESS {
                log::warn!("failed to set macOS AX attribute {name}: {error}");
            }
        }
    }

    fn perform_action(element: AXUIElementRef, name: &'static str) {
        if let Ok(action) = CfString::new(name) {
            let error = unsafe { AXUIElementPerformAction(element, action.as_ptr()) };
            if error != K_AX_ERROR_SUCCESS {
                log::warn!("failed to perform macOS AX action {name}: {error}");
            }
        }
    }

    fn cf_string_to_string(value: CFStringRef) -> Option<String> {
        let length = unsafe { CFStringGetLength(value) };
        let max_size =
            unsafe { CFStringGetMaximumSizeForEncoding(length, K_CF_STRING_ENCODING_UTF8) };
        let buffer_size = max_size.checked_add(1)?;
        let mut buffer = vec![0_i8; buffer_size as usize];
        let copied = unsafe {
            CFStringGetCString(
                value,
                buffer.as_mut_ptr(),
                buffer_size,
                K_CF_STRING_ENCODING_UTF8,
            )
        };

        if copied == 0 {
            return None;
        }

        unsafe { CStr::from_ptr(buffer.as_ptr()) }
            .to_str()
            .ok()
            .map(ToOwned::to_owned)
    }

    fn no_focused_target() -> PlatformError {
        PlatformError::new(
            "no_focused_target",
            "No focused text target is available for dictation.",
        )
    }

    fn macos_error(message: impl Into<String>) -> PlatformError {
        PlatformError::new("macos_insertion_error", message)
    }

    struct CfString {
        value: CFStringRef,
    }

    impl CfString {
        fn new(value: &str) -> Result<Self, PlatformError> {
            let c_value = CString::new(value)
                .map_err(|_| macos_error(format!("failed to create CString for {value}")))?;
            let cf_value = unsafe {
                CFStringCreateWithCString(ptr::null(), c_value.as_ptr(), K_CF_STRING_ENCODING_UTF8)
            };

            if cf_value.is_null() {
                return Err(macos_error(format!(
                    "failed to create CFString for {value}"
                )));
            }

            Ok(Self { value: cf_value })
        }

        fn as_ptr(&self) -> CFStringRef {
            self.value
        }
    }

    impl Drop for CfString {
        fn drop(&mut self) {
            unsafe { CFRelease(self.value as CFTypeRef) };
        }
    }

    struct RetainedCfType {
        value: CFTypeRef,
    }

    impl RetainedCfType {
        fn new(value: CFTypeRef) -> Self {
            Self { value }
        }

        fn as_ptr(&self) -> CFTypeRef {
            self.value
        }
    }

    impl Drop for RetainedCfType {
        fn drop(&mut self) {
            unsafe { CFRelease(self.value) };
        }
    }

    struct RetainedAxElement {
        value: AXUIElementRef,
    }

    impl RetainedAxElement {
        fn new(value: CFTypeRef) -> Self {
            Self {
                value: value as AXUIElementRef,
            }
        }

        fn as_ptr(&self) -> AXUIElementRef {
            self.value
        }
    }

    impl Drop for RetainedAxElement {
        fn drop(&mut self) {
            unsafe { CFRelease(self.value as CFTypeRef) };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_text_returns_noop_result() {
        let result = insert_text("").unwrap();

        assert_eq!(result.method, "noop");
        assert_eq!(result.characters, 0);
    }

    #[test]
    fn non_empty_text_reports_clipboard_paste_method() {
        let result = insert_text_for_captured_target(
            "hello",
            &test_field("macos:ax:1:field:Field:AXTextField:"),
        )
        .unwrap();

        assert_eq!(result.method, "clipboard_paste");
        assert_eq!(result.characters, 5);
    }

    #[test]
    fn strategy_plan_uses_clipboard_for_simple_text_fields_to_preserve_caret() {
        let field = test_field("macos:ax:1:field:Field:AXTextField:");

        assert_eq!(
            macos_insertion_plan(&field),
            vec![MacInsertionStrategy::ClipboardPaste],
        );
    }

    #[test]
    fn strategy_plan_uses_clipboard_for_complex_text_areas() {
        let mut field = test_field("macos:ax:1:field:Body:AXTextArea:");
        field.control_type = "AXTextArea".to_string();

        assert_eq!(
            macos_insertion_plan(&field),
            vec![MacInsertionStrategy::ClipboardPaste],
        );
    }

    #[test]
    fn macos_insert_log_payload_includes_strategy_and_target_shape() {
        let diagnostics = MacTargetDiagnostics::from_snapshot(
            test_field("macos:ax:1:field:Field:AXTextField:"),
            "focused_element",
        )
        .with_strategy(MacInsertionStrategy::ClipboardPaste);

        let payload = MacLogPayload::target_event(
            "insert_strategy_attempted",
            "insert-42",
            &diagnostics,
            None,
        );
        let json = serde_json::to_value(payload).expect("payload should serialize");

        assert_eq!(json["event"], "insert_strategy_attempted");
        assert_eq!(json["operationId"], "insert-42");
        assert_eq!(json["stableId"], "macos:ax:1:field:Field:AXTextField:");
        assert_eq!(json["chosenStrategy"], "clipboard_paste");
        assert_eq!(json["candidateSource"], "focused_element");
    }

    #[test]
    fn captured_target_match_accepts_exact_stable_id() {
        let captured = test_field("macos:ax:1:field:Field:AXTextField:");
        let current = test_field("macos:ax:1:field:Field:AXTextField:");

        assert!(captured_target_matches(&captured, &current));
    }

    #[test]
    fn captured_target_match_rejects_changed_stable_id() {
        let captured = test_field("macos:ax:1:field:Field:AXTextField:");
        let current = test_field("macos:ax:2:field:Field:AXTextField:");

        assert!(!captured_target_matches(&captured, &current));
        assert_eq!(
            ensure_captured_target(
                "insert-test",
                &captured,
                &MacTargetDiagnostics::from_snapshot(current, "focused_element"),
            )
            .unwrap_err()
            .code,
            "target_changed"
        );
    }

    #[test]
    fn captured_target_match_accepts_same_ax_identifier_when_stable_id_drifts() {
        let mut captured = test_field("macos:ax:42:note-body:Body:AXTextArea:AXStandardWindow");
        captured.window_title = "Notes".to_string();
        captured.control_type = "AXTextArea".to_string();
        captured.automation_id = "note-body".to_string();

        let mut current = test_field("macos:ax:42:note-body:Body:AXTextArea:");
        current.window_title = "Notes".to_string();
        current.control_type = "AXTextArea".to_string();
        current.automation_id = "note-body".to_string();

        assert!(captured_target_matches(&captured, &current));
    }

    #[test]
    fn captured_target_match_rejects_same_ax_identifier_in_another_window() {
        let mut captured = test_field("macos:ax:42:note-body:Body:AXTextArea:AXStandardWindow");
        captured.window_title = "Notes".to_string();
        captured.control_type = "AXTextArea".to_string();
        captured.automation_id = "note-body".to_string();

        let mut current = test_field("macos:ax:42:note-body:Body:AXTextArea:");
        current.window_title = "Mail".to_string();
        current.control_type = "AXTextArea".to_string();
        current.automation_id = "note-body".to_string();

        assert!(!captured_target_matches(&captured, &current));
    }

    #[test]
    fn captured_target_match_rejects_same_ax_identifier_in_another_process() {
        let mut captured = test_field("macos:ax:42:note-body:Body:AXTextArea:AXStandardWindow");
        captured.window_title = "Notes".to_string();
        captured.control_type = "AXTextArea".to_string();
        captured.automation_id = "note-body".to_string();

        let mut current = test_field("macos:ax:43:note-body:Body:AXTextArea:");
        current.window_title = "Notes".to_string();
        current.control_type = "AXTextArea".to_string();
        current.automation_id = "note-body".to_string();

        assert!(!captured_target_matches(&captured, &current));
    }

    #[test]
    fn macos_process_id_parser_ignores_malformed_stable_ids() {
        assert_eq!(
            macos_process_id_from_stable_id("macos:ax:42:field:title:AXTextField:"),
            Some(42)
        );
        assert_eq!(macos_process_id_from_stable_id("windows:42"), None);
        assert_eq!(macos_process_id_from_stable_id("macos:ax:not-a-pid"), None);
    }
}
