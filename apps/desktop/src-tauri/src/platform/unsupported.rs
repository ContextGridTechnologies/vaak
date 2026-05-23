use crate::platform::common::{
    CaptureInsertResult, FocusedFieldInfo, PlatformError, TextInsertResult,
};

pub(crate) fn get_focused_field(platform: &str) -> Result<FocusedFieldInfo, PlatformError> {
    Err(PlatformError::unsupported(platform, "get_focused_field"))
}

pub(crate) fn insert_text(platform: &str, _text: &str) -> Result<TextInsertResult, PlatformError> {
    Err(PlatformError::unsupported(platform, "insert_text"))
}

pub(crate) fn insert_text_for_stable_id(
    platform: &str,
    _text: &str,
    _stable_id: &str,
) -> Result<TextInsertResult, PlatformError> {
    Err(PlatformError::unsupported(
        platform,
        "insert_text_for_stable_id",
    ))
}

pub(crate) fn insert_text_for_captured_target(
    platform: &str,
    _text: &str,
    _captured: &FocusedFieldInfo,
) -> Result<TextInsertResult, PlatformError> {
    Err(PlatformError::unsupported(
        platform,
        "insert_text_for_captured_target",
    ))
}

pub(crate) fn capture_and_insert(
    platform: &str,
    _text: &str,
) -> Result<CaptureInsertResult, PlatformError> {
    Err(PlatformError::unsupported(platform, "capture_and_insert"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn focused_field() -> FocusedFieldInfo {
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
            stable_id: String::new(),
        }
    }

    fn assert_unsupported<T: std::fmt::Debug>(result: Result<T, PlatformError>, action: &str) {
        let err = result.unwrap_err();

        assert_eq!(err.code, "unsupported");
        assert_eq!(
            err.message,
            format!("{action} is not available on Linux yet")
        );
    }

    #[test]
    fn unsupported_platform_shim_returns_action_specific_errors() {
        let captured = focused_field();

        assert_unsupported(get_focused_field("Linux"), "get_focused_field");
        assert_unsupported(insert_text("Linux", "hello"), "insert_text");
        assert_unsupported(
            insert_text_for_stable_id("Linux", "hello", "target"),
            "insert_text_for_stable_id",
        );
        assert_unsupported(
            insert_text_for_captured_target("Linux", "hello", &captured),
            "insert_text_for_captured_target",
        );
        assert_unsupported(capture_and_insert("Linux", "hello"), "capture_and_insert");
    }
}
