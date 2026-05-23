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

    #[cfg(any(not(windows), test))]
    pub fn unsupported(platform: &str, action: &str) -> Self {
        Self::new(
            "unsupported",
            format!("{action} is not available on {platform} yet"),
        )
    }
}

impl std::fmt::Display for PlatformError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for PlatformError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unsupported_errors_name_the_platform_and_action() {
        let err = PlatformError::unsupported("macOS", "insert_text");

        assert_eq!(err.code, "unsupported");
        assert_eq!(err.message, "insert_text is not available on macOS yet");
    }
}
