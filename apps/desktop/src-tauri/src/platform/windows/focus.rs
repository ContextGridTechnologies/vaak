use crate::platform::common::{FocusedFieldInfo, PlatformError};
use crate::platform::windows::com::ComInit;
use crate::platform::windows::uia::{
    bstr_to_string, control_type_to_string, create_automation, get_current_value,
    get_focused_element, window_title_from_handle,
};
use windows::Win32::UI::Accessibility::IUIAutomationElement;

pub(crate) fn get_focused_field() -> Result<FocusedFieldInfo, PlatformError> {
    let _com = ComInit::new()?;
    let automation = create_automation()?;
    let element = get_focused_element(&automation)?;
    Ok(build_focused_field_info(&element))
}

pub(crate) fn build_focused_field_info(element: &IUIAutomationElement) -> FocusedFieldInfo {
    let control_type_id = unsafe { element.CurrentControlType() }.unwrap_or_default();
    let control_type_id_value = control_type_id.0;

    let native_handle = unsafe { element.CurrentNativeWindowHandle() }.unwrap_or_default();
    let native_handle_value = native_handle.0 as i64;

    let window_title = window_title_from_handle(native_handle);
    let control_name = bstr_to_string(unsafe { element.CurrentName() });
    let automation_id = bstr_to_string(unsafe { element.CurrentAutomationId() });
    let framework_id = bstr_to_string(unsafe { element.CurrentFrameworkId() });
    let class_name = bstr_to_string(unsafe { element.CurrentClassName() });
    let current_value = get_current_value(element);

    let stable_id = if !automation_id.is_empty() {
        format!("{}:{}", native_handle_value, automation_id)
    } else if !class_name.is_empty() {
        format!("{}:{}:{}", native_handle_value, class_name, control_type_id_value)
    } else {
        format!("{}:{}", native_handle_value, control_type_id_value)
    };

    FocusedFieldInfo {
        window_title,
        control_name,
        control_type: control_type_to_string(control_type_id_value),
        control_type_id: control_type_id_value,
        automation_id,
        framework_id,
        class_name,
        current_value,
        native_window_handle: native_handle_value,
        stable_id,
    }
}
