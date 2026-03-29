pub mod common;

#[cfg(windows)]
pub mod windows;

use common::{CaptureInsertResult, FocusedFieldInfo, PlatformError, TextInsertResult};

#[cfg(windows)]
pub fn get_focused_field() -> Result<FocusedFieldInfo, PlatformError> {
    windows::get_focused_field()
}

#[cfg(not(windows))]
pub fn get_focused_field() -> Result<FocusedFieldInfo, PlatformError> {
    Err(PlatformError::unsupported("get_focused_field"))
}

#[cfg(windows)]
pub fn insert_text(text: &str) -> Result<TextInsertResult, PlatformError> {
    windows::insert_text(text)
}

#[cfg(windows)]
pub fn insert_text_for_stable_id(
    text: &str,
    stable_id: &str,
) -> Result<TextInsertResult, PlatformError> {
    windows::insert_text_for_stable_id(text, stable_id)
}

#[cfg(not(windows))]
pub fn insert_text(_text: &str) -> Result<TextInsertResult, PlatformError> {
    Err(PlatformError::unsupported("insert_text"))
}

#[cfg(not(windows))]
pub fn insert_text_for_stable_id(
    _text: &str,
    _stable_id: &str,
) -> Result<TextInsertResult, PlatformError> {
    Err(PlatformError::unsupported("insert_text_for_stable_id"))
}

#[cfg(windows)]
pub fn capture_and_insert(text: &str) -> Result<CaptureInsertResult, PlatformError> {
    windows::capture_and_insert(text)
}

#[cfg(not(windows))]
pub fn capture_and_insert(_text: &str) -> Result<CaptureInsertResult, PlatformError> {
    Err(PlatformError::unsupported("capture_and_insert"))
}
