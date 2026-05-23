use crate::platform::common::{
    CaptureInsertResult, FocusedFieldInfo, PlatformError, TextInsertResult,
};
use crate::platform::unsupported;

const PLATFORM: &str = "macOS";

pub(crate) fn get_focused_field() -> Result<FocusedFieldInfo, PlatformError> {
    unsupported::get_focused_field(PLATFORM)
}

pub(crate) fn insert_text(text: &str) -> Result<TextInsertResult, PlatformError> {
    unsupported::insert_text(PLATFORM, text)
}

pub(crate) fn insert_text_for_stable_id(
    text: &str,
    stable_id: &str,
) -> Result<TextInsertResult, PlatformError> {
    unsupported::insert_text_for_stable_id(PLATFORM, text, stable_id)
}

pub(crate) fn insert_text_for_captured_target(
    text: &str,
    captured: &FocusedFieldInfo,
) -> Result<TextInsertResult, PlatformError> {
    unsupported::insert_text_for_captured_target(PLATFORM, text, captured)
}

pub(crate) fn capture_and_insert(text: &str) -> Result<CaptureInsertResult, PlatformError> {
    unsupported::capture_and_insert(PLATFORM, text)
}
