use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusedFieldInfo {
    pub window_title: String,
    pub control_name: String,
    pub control_type: String,
    pub control_type_id: i32,
    pub automation_id: String,
    pub framework_id: String,
    pub class_name: String,
    pub current_value: String,
    pub native_window_handle: i64,
    pub stable_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextInsertResult {
    pub method: String,
    pub characters: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureInsertResult {
    pub field: FocusedFieldInfo,
    pub insert: TextInsertResult,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlatformError {
    pub code: String,
    pub message: String,
}

impl PlatformError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }

    #[cfg(not(windows))]
    pub fn unsupported(action: &str) -> Self {
        Self::new(
            "unsupported",
            format!("{action} is only available on Windows"),
        )
    }
}

impl std::fmt::Display for PlatformError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for PlatformError {}
