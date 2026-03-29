use crate::platform;
use crate::platform::common::{
    CaptureInsertResult, FocusedFieldInfo, PlatformError, TextInsertResult,
};
use crate::session::{HotkeyBindings, SessionStore};
use tauri::State;

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

#[tauri::command]
pub fn insert_into_active_target(
    text: String,
    session: State<'_, SessionStore>,
) -> Result<TextInsertResult, PlatformError> {
    let stable_id = session.get_dictation_target_stable_id().ok_or_else(|| {
        PlatformError::new("no_active_target", "No captured dictation target available")
    })?;
    platform::insert_text_for_stable_id(&text, &stable_id)
}

#[tauri::command]
pub fn get_hotkey_bindings(session: State<'_, SessionStore>) -> HotkeyBindings {
    session.hotkey_bindings()
}
