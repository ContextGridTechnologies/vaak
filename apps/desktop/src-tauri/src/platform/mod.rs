pub mod common;

#[cfg(any(not(windows), test))]
pub(crate) mod unsupported;

#[cfg(target_os = "linux")]
pub mod linux;

#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(windows)]
pub mod windows;

use common::{CaptureInsertResult, FocusedFieldInfo, PlatformError, TextInsertResult};

#[cfg(windows)]
pub fn get_focused_field() -> Result<FocusedFieldInfo, PlatformError> {
    windows::get_focused_field()
}

#[cfg(target_os = "macos")]
pub fn get_focused_field() -> Result<FocusedFieldInfo, PlatformError> {
    macos::get_focused_field()
}

#[cfg(target_os = "linux")]
pub fn get_focused_field() -> Result<FocusedFieldInfo, PlatformError> {
    linux::get_focused_field()
}

#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
pub fn get_focused_field() -> Result<FocusedFieldInfo, PlatformError> {
    unsupported::get_focused_field(std::env::consts::OS)
}

#[cfg(windows)]
pub fn insert_text(text: &str) -> Result<TextInsertResult, PlatformError> {
    windows::insert_text(text)
}

#[cfg(windows)]
#[allow(dead_code)]
pub fn insert_text_for_stable_id(
    text: &str,
    stable_id: &str,
) -> Result<TextInsertResult, PlatformError> {
    windows::insert_text_for_stable_id(text, stable_id)
}

#[cfg(windows)]
pub fn insert_text_for_captured_target(
    text: &str,
    captured: &FocusedFieldInfo,
) -> Result<TextInsertResult, PlatformError> {
    windows::insert_text_for_captured_target(text, captured)
}

#[cfg(target_os = "macos")]
pub fn insert_text(_text: &str) -> Result<TextInsertResult, PlatformError> {
    macos::insert_text(_text)
}

#[cfg(target_os = "linux")]
pub fn insert_text(_text: &str) -> Result<TextInsertResult, PlatformError> {
    linux::insert_text(_text)
}

#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
pub fn insert_text(text: &str) -> Result<TextInsertResult, PlatformError> {
    unsupported::insert_text(std::env::consts::OS, text)
}

#[cfg(target_os = "macos")]
pub fn insert_text_for_stable_id(
    _text: &str,
    _stable_id: &str,
) -> Result<TextInsertResult, PlatformError> {
    macos::insert_text_for_stable_id(_text, _stable_id)
}

#[cfg(target_os = "linux")]
pub fn insert_text_for_stable_id(
    _text: &str,
    _stable_id: &str,
) -> Result<TextInsertResult, PlatformError> {
    linux::insert_text_for_stable_id(_text, _stable_id)
}

#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
pub fn insert_text_for_stable_id(
    text: &str,
    stable_id: &str,
) -> Result<TextInsertResult, PlatformError> {
    unsupported::insert_text_for_stable_id(std::env::consts::OS, text, stable_id)
}

#[cfg(target_os = "macos")]
pub fn insert_text_for_captured_target(
    _text: &str,
    _captured: &FocusedFieldInfo,
) -> Result<TextInsertResult, PlatformError> {
    macos::insert_text_for_captured_target(_text, _captured)
}

#[cfg(target_os = "linux")]
pub fn insert_text_for_captured_target(
    _text: &str,
    _captured: &FocusedFieldInfo,
) -> Result<TextInsertResult, PlatformError> {
    linux::insert_text_for_captured_target(_text, _captured)
}

#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
pub fn insert_text_for_captured_target(
    text: &str,
    captured: &FocusedFieldInfo,
) -> Result<TextInsertResult, PlatformError> {
    unsupported::insert_text_for_captured_target(std::env::consts::OS, text, captured)
}

#[cfg(windows)]
pub fn capture_and_insert(text: &str) -> Result<CaptureInsertResult, PlatformError> {
    windows::capture_and_insert(text)
}

#[cfg(target_os = "macos")]
pub fn capture_and_insert(_text: &str) -> Result<CaptureInsertResult, PlatformError> {
    macos::capture_and_insert(_text)
}

#[cfg(target_os = "linux")]
pub fn capture_and_insert(_text: &str) -> Result<CaptureInsertResult, PlatformError> {
    linux::capture_and_insert(_text)
}

#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
pub fn capture_and_insert(text: &str) -> Result<CaptureInsertResult, PlatformError> {
    unsupported::capture_and_insert(std::env::consts::OS, text)
}
