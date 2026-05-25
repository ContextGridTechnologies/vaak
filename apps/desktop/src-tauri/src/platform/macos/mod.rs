#![cfg_attr(all(test, not(target_os = "macos")), allow(dead_code))]

use crate::platform::common::{
    CaptureInsertResult, FocusedFieldInfo, PermissionStatus, PlatformError, TextInsertResult,
};
use crate::platform::unsupported;

mod focus;
mod insert;

const PLATFORM: &str = "macOS";
const ACCESSIBILITY_PERMISSION_ID: &str = "accessibility";
const ACCESSIBILITY_PERMISSION_LABEL: &str = "Accessibility";
const ACCESSIBILITY_PERMISSION_GUIDANCE: &str =
    "Grant Accessibility access to Vaak in System Settings > Privacy & Security > Accessibility.";
const INPUT_MONITORING_PERMISSION_ID: &str = "input_monitoring";
const INPUT_MONITORING_PERMISSION_LABEL: &str = "Input Monitoring";
const INPUT_MONITORING_PERMISSION_GUIDANCE: &str =
    "Grant Input Monitoring access to Vaak in System Settings > Privacy & Security > Input Monitoring.";

#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrusted() -> u8;
    fn CGPreflightListenEventAccess() -> u8;
}

pub(crate) fn get_focused_field() -> Result<FocusedFieldInfo, PlatformError> {
    ensure_accessibility_permission()?;
    #[cfg(target_os = "macos")]
    {
        focus::get_focused_field()
    }
    #[cfg(not(target_os = "macos"))]
    {
        focus::focused_field_from_metadata(None)
    }
}

pub(crate) fn insert_text(text: &str) -> Result<TextInsertResult, PlatformError> {
    ensure_accessibility_permission()?;
    #[cfg(target_os = "macos")]
    {
        insert::insert_text(text)
    }
    #[cfg(not(target_os = "macos"))]
    {
        unsupported::insert_text(PLATFORM, text)
    }
}

pub(crate) fn insert_text_for_stable_id(
    text: &str,
    stable_id: &str,
) -> Result<TextInsertResult, PlatformError> {
    ensure_accessibility_permission()?;
    #[cfg(target_os = "macos")]
    {
        insert::insert_text_for_stable_id(text, stable_id)
    }
    #[cfg(not(target_os = "macos"))]
    {
        unsupported::insert_text_for_stable_id(PLATFORM, text, stable_id)
    }
}

pub(crate) fn insert_text_for_captured_target(
    text: &str,
    captured: &FocusedFieldInfo,
) -> Result<TextInsertResult, PlatformError> {
    ensure_accessibility_permission()?;
    #[cfg(target_os = "macos")]
    {
        insert::insert_text_for_captured_target(text, captured)
    }
    #[cfg(not(target_os = "macos"))]
    {
        unsupported::insert_text_for_captured_target(PLATFORM, text, captured)
    }
}

pub(crate) fn capture_and_insert(text: &str) -> Result<CaptureInsertResult, PlatformError> {
    ensure_accessibility_permission()?;
    #[cfg(target_os = "macos")]
    {
        insert::capture_and_insert(text)
    }
    #[cfg(not(target_os = "macos"))]
    {
        unsupported::capture_and_insert(PLATFORM, text)
    }
}

pub(crate) fn accessibility_permission_status() -> PermissionStatus {
    PermissionStatus {
        id: ACCESSIBILITY_PERMISSION_ID.to_string(),
        label: ACCESSIBILITY_PERMISSION_LABEL.to_string(),
        required: true,
        granted: is_accessibility_trusted(),
        guidance: ACCESSIBILITY_PERMISSION_GUIDANCE.to_string(),
    }
}

pub(crate) fn input_monitoring_permission_status() -> PermissionStatus {
    PermissionStatus {
        id: INPUT_MONITORING_PERMISSION_ID.to_string(),
        label: INPUT_MONITORING_PERMISSION_LABEL.to_string(),
        required: true,
        granted: is_input_monitoring_trusted(),
        guidance: INPUT_MONITORING_PERMISSION_GUIDANCE.to_string(),
    }
}

fn ensure_accessibility_permission() -> Result<(), PlatformError> {
    if is_accessibility_trusted() {
        return Ok(());
    }

    Err(PlatformError::permission_denied(
        ACCESSIBILITY_PERMISSION_ID,
        ACCESSIBILITY_PERMISSION_GUIDANCE,
    ))
}

#[cfg(target_os = "macos")]
fn is_accessibility_trusted() -> bool {
    unsafe { AXIsProcessTrusted() != 0 }
}

#[cfg(not(target_os = "macos"))]
fn is_accessibility_trusted() -> bool {
    true
}

#[cfg(target_os = "macos")]
fn is_input_monitoring_trusted() -> bool {
    unsafe { CGPreflightListenEventAccess() != 0 }
}

#[cfg(not(target_os = "macos"))]
fn is_input_monitoring_trusted() -> bool {
    true
}
