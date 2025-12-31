use crate::platform;
use crate::platform::common::{
    CaptureInsertResult, FocusedFieldInfo, PlatformError, TextInsertResult,
};

#[tauri::command]
pub fn get_focused_field() -> Result<FocusedFieldInfo, PlatformError> {
    platform::get_focused_field()
}

#[tauri::command]
pub fn insert_text(text: String) -> Result<TextInsertResult, PlatformError> {
    platform::insert_text(&text)
}

#[tauri::command]
pub fn capture_and_insert(text: String) -> Result<CaptureInsertResult, PlatformError> {
    platform::capture_and_insert(&text)
}
