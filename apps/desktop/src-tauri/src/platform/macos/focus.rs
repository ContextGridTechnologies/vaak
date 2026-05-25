use crate::platform::common::{FocusedFieldInfo, PlatformError};

#[cfg(target_os = "macos")]
use std::ffi::c_void;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct AxFocusedElementMetadata {
    pub process_id: i32,
    pub window_title: Option<String>,
    pub title: Option<String>,
    pub role: Option<String>,
    pub subrole: Option<String>,
    pub identifier: Option<String>,
    pub value: Option<String>,
}

#[cfg(target_os = "macos")]
pub(crate) fn get_focused_field() -> Result<FocusedFieldInfo, PlatformError> {
    focused_field_from_metadata(copy_focused_element_metadata()?)
}

pub(crate) fn focused_field_from_metadata(
    metadata: Option<AxFocusedElementMetadata>,
) -> Result<FocusedFieldInfo, PlatformError> {
    let metadata = metadata.ok_or_else(no_focused_target)?;
    let role = metadata.role.unwrap_or_default();

    if !is_text_like_role(&role) {
        return Err(no_focused_target());
    }

    let title = metadata.title.unwrap_or_default();
    let identifier = metadata.identifier.unwrap_or_default();
    let subrole = metadata.subrole.unwrap_or_default();

    Ok(FocusedFieldInfo {
        window_title: metadata.window_title.unwrap_or_default(),
        control_name: title.clone(),
        control_type: role.clone(),
        control_type_id: 0,
        automation_id: identifier.clone(),
        framework_id: "AX".to_string(),
        class_name: subrole.clone(),
        current_value: metadata.value.unwrap_or_default(),
        native_window_handle: 0,
        stable_id: build_stable_id(metadata.process_id, &identifier, &title, &role, &subrole),
    })
}

fn build_stable_id(
    process_id: i32,
    identifier: &str,
    title: &str,
    role: &str,
    subrole: &str,
) -> String {
    format!("macos:ax:{process_id}:{identifier}:{title}:{role}:{subrole}")
}

fn is_text_like_role(role: &str) -> bool {
    matches!(
        role,
        "AXTextField" | "AXTextArea" | "AXWebArea" | "AXComboBox" | "AXSearchField"
    )
}

fn no_focused_target() -> PlatformError {
    PlatformError::new(
        "no_focused_target",
        "No focused text target is available for dictation.",
    )
}

#[cfg(target_os = "macos")]
mod native {
    use super::*;
    use std::ffi::{CStr, CString};
    use std::os::raw::{c_char, c_int};
    use std::ptr;

    type AXError = i32;
    type AXUIElementRef = *const c_void;
    type CFIndex = isize;
    type CFStringEncoding = u32;
    type CFStringRef = *const c_void;
    type CFTypeID = usize;
    type CFTypeRef = *const c_void;
    type PidT = c_int;

    const K_AX_ERROR_SUCCESS: AXError = 0;
    const K_AX_ERROR_ATTRIBUTE_UNSUPPORTED: AXError = -25205;
    const K_AX_ERROR_NO_VALUE: AXError = -25212;
    const K_CF_STRING_ENCODING_UTF8: CFStringEncoding = 0x0800_0100;

    #[link(name = "ApplicationServices", kind = "framework")]
    unsafe extern "C" {
        fn AXUIElementCreateSystemWide() -> AXUIElementRef;
        fn AXUIElementCopyAttributeValue(
            element: AXUIElementRef,
            attribute: CFStringRef,
            value: *mut CFTypeRef,
        ) -> AXError;
        fn AXUIElementGetPid(element: AXUIElementRef, pid: *mut PidT) -> AXError;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFGetTypeID(cf: CFTypeRef) -> CFTypeID;
        fn CFRelease(cf: CFTypeRef);
        fn CFStringCreateWithCString(
            alloc: *const c_void,
            c_str: *const c_char,
            encoding: CFStringEncoding,
        ) -> CFStringRef;
        fn CFStringGetCString(
            the_string: CFStringRef,
            buffer: *mut c_char,
            buffer_size: CFIndex,
            encoding: CFStringEncoding,
        ) -> u8;
        fn CFStringGetLength(the_string: CFStringRef) -> CFIndex;
        fn CFStringGetMaximumSizeForEncoding(
            length: CFIndex,
            encoding: CFStringEncoding,
        ) -> CFIndex;
        fn CFStringGetTypeID() -> CFTypeID;
    }

    pub(super) fn copy_focused_element_metadata(
    ) -> Result<Option<AxFocusedElementMetadata>, PlatformError> {
        let system = unsafe { AXUIElementCreateSystemWide() };
        if system.is_null() {
            return Err(macos_accessibility_error(
                "failed to create system-wide AX element",
            ));
        }
        let system = RetainedAxElement::new(system as CFTypeRef);

        let focused = match copy_attribute(system.as_ptr(), "AXFocusedUIElement")? {
            Some(value) => RetainedAxElement::new(value),
            None => return Ok(None),
        };

        let process_id = ax_process_id(focused.as_ptr())?;
        let window_title = match copy_attribute(focused.as_ptr(), "AXWindow")? {
            Some(window) => {
                let window = RetainedAxElement::new(window);
                copy_string_attribute(window.as_ptr(), "AXTitle")?
            }
            None => None,
        };

        Ok(Some(AxFocusedElementMetadata {
            process_id,
            window_title,
            title: copy_string_attribute(focused.as_ptr(), "AXTitle")?,
            role: copy_string_attribute(focused.as_ptr(), "AXRole")?,
            subrole: copy_string_attribute(focused.as_ptr(), "AXSubrole")?,
            identifier: copy_string_attribute(focused.as_ptr(), "AXIdentifier")?,
            value: copy_string_attribute(focused.as_ptr(), "AXValue")?,
        }))
    }

    fn ax_process_id(element: AXUIElementRef) -> Result<i32, PlatformError> {
        let mut pid: PidT = 0;
        let error = unsafe { AXUIElementGetPid(element, &mut pid) };
        if error == K_AX_ERROR_SUCCESS {
            return Ok(pid);
        }

        Err(macos_accessibility_error(format!(
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
            _ => Err(macos_accessibility_error(format!(
                "AXUIElementCopyAttributeValue({name}) failed with error {error}"
            ))),
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

    fn macos_accessibility_error(message: impl Into<String>) -> PlatformError {
        PlatformError::new("macos_accessibility_error", message)
    }

    struct CfString {
        value: CFStringRef,
    }

    impl CfString {
        fn new(value: &'static str) -> Result<Self, PlatformError> {
            let c_value = CString::new(value).map_err(|_| {
                macos_accessibility_error(format!("failed to create CString for {value}"))
            })?;
            let cf_value = unsafe {
                CFStringCreateWithCString(ptr::null(), c_value.as_ptr(), K_CF_STRING_ENCODING_UTF8)
            };

            if cf_value.is_null() {
                return Err(macos_accessibility_error(format!(
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

#[cfg(target_os = "macos")]
use native::copy_focused_element_metadata;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_stable_ids_deterministically_from_ax_metadata() {
        let metadata = AxFocusedElementMetadata {
            process_id: 42,
            window_title: Some("Notes".to_string()),
            title: Some("Body".to_string()),
            role: Some("AXTextArea".to_string()),
            subrole: Some("AXStandardWindow".to_string()),
            identifier: Some("note-body".to_string()),
            value: Some("Draft".to_string()),
        };

        let field = focused_field_from_metadata(Some(metadata)).unwrap();

        assert_eq!(
            field.stable_id,
            "macos:ax:42:note-body:Body:AXTextArea:AXStandardWindow"
        );
        assert_eq!(field.framework_id, "AX");
        assert_eq!(field.control_type_id, 0);
        assert_eq!(field.native_window_handle, 0);
    }

    #[test]
    fn maps_missing_optional_ax_attributes_to_empty_defaults() {
        let field = focused_field_from_metadata(Some(AxFocusedElementMetadata {
            process_id: 7,
            role: Some("AXTextField".to_string()),
            ..AxFocusedElementMetadata::default()
        }))
        .unwrap();

        assert_eq!(field.window_title, "");
        assert_eq!(field.control_name, "");
        assert_eq!(field.control_type, "AXTextField");
        assert_eq!(field.automation_id, "");
        assert_eq!(field.class_name, "");
        assert_eq!(field.current_value, "");
        assert_eq!(field.stable_id, "macos:ax:7:::AXTextField:");
    }

    #[test]
    fn returns_no_focused_target_for_no_focused_element() {
        let err = focused_field_from_metadata(None).unwrap_err();

        assert_eq!(err.code, "no_focused_target");
    }

    #[test]
    fn returns_no_focused_target_for_non_text_roles() {
        let err = focused_field_from_metadata(Some(AxFocusedElementMetadata {
            process_id: 9,
            role: Some("AXButton".to_string()),
            ..AxFocusedElementMetadata::default()
        }))
        .unwrap_err();

        assert_eq!(err.code, "no_focused_target");
    }
}
