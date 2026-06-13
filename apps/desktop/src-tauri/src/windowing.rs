use crate::storage::{VoiceCapsuleAnchor, VoiceCapsuleMonitorMetadata, VoiceCapsulePlacement};
use tauri::window::Color;
use tauri::{LogicalPosition, LogicalSize, Size, WebviewWindow};

const APP_BACKGROUND_COLORREF: u32 = colorref_from_rgb(0xF8, 0xFA, 0xFC);
const APP_TITLE_TEXT_COLORREF: u32 = colorref_from_rgb(0x20, 0x27, 0x2F);
const APP_DARK_BACKGROUND_COLORREF: u32 = colorref_from_rgb(0x0F, 0x14, 0x1B);
const APP_DARK_TITLE_TEXT_COLORREF: u32 = colorref_from_rgb(0xEA, 0xED, 0xF0);
const VOICE_CAPSULE_WIDTH: f64 = 56.0;
const VOICE_CAPSULE_HEIGHT: f64 = 36.0;
const DEFAULT_EDGE_OFFSET: f64 = 24.0;
#[cfg(any(target_os = "macos", test))]
const APP_BACKGROUND_RGB: (u8, u8, u8) = (0xF8, 0xFA, 0xFC);
#[cfg(any(target_os = "macos", test))]
const APP_DARK_BACKGROUND_RGB: (u8, u8, u8) = (0x0F, 0x14, 0x1B);

pub trait VoiceCapsuleWindow {
    fn set_shadow(&self, shadow: bool) -> Result<(), String>;
    fn set_background_color(&self, color: Color) -> Result<(), String>;
    fn set_always_on_top(&self, always_on_top: bool) -> Result<(), String>;
    fn prepare_native_voice_capsule(&self) -> Result<(), String>;
    fn set_logical_size(&self, width: f64, height: f64) -> Result<(), String>;
    fn current_monitor_work_area(&self) -> Result<Option<MonitorWorkArea>, String>;
    fn set_logical_position(&self, x: f64, y: f64) -> Result<(), String>;
    fn show(&self) -> Result<(), String>;
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MonitorWorkArea {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub scale_factor: f64,
}

pub fn prepare_main_window<R: tauri::Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
    let theme = window.theme().map_err(|err| err.to_string())?;
    apply_native_titlebar_color(window, theme)
}

#[cfg(windows)]
fn apply_native_titlebar_color<R: tauri::Runtime>(
    window: &WebviewWindow<R>,
    theme: tauri::Theme,
) -> Result<(), String> {
    use windows_sys::Win32::Graphics::Dwm::{
        DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR, DWMWA_USE_IMMERSIVE_DARK_MODE,
    };

    let hwnd = window.hwnd().map_err(|err| err.to_string())?;
    let raw_hwnd = hwnd.0;
    let titlebar_theme = native_titlebar_theme(theme);
    set_dwm_bool_attribute(
        raw_hwnd,
        DWMWA_USE_IMMERSIVE_DARK_MODE as u32,
        titlebar_theme.immersive_dark_mode,
    )?;
    set_dwm_color_attribute(
        raw_hwnd,
        DWMWA_CAPTION_COLOR as u32,
        titlebar_theme.background,
    )?;
    set_dwm_color_attribute(
        raw_hwnd,
        DWMWA_BORDER_COLOR as u32,
        titlebar_theme.background,
    )?;
    set_dwm_color_attribute(raw_hwnd, DWMWA_TEXT_COLOR as u32, titlebar_theme.text)?;
    Ok(())
}

pub fn apply_main_window_theme(window: &tauri::Window, theme: tauri::Theme) -> Result<(), String> {
    apply_native_window_titlebar_color(window, theme)
}

#[cfg(windows)]
fn apply_native_window_titlebar_color(
    window: &tauri::Window,
    theme: tauri::Theme,
) -> Result<(), String> {
    use windows_sys::Win32::Graphics::Dwm::{
        DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR, DWMWA_USE_IMMERSIVE_DARK_MODE,
    };

    let hwnd = window.hwnd().map_err(|err| err.to_string())?;
    let raw_hwnd = hwnd.0;
    let titlebar_theme = native_titlebar_theme(theme);
    set_dwm_bool_attribute(
        raw_hwnd,
        DWMWA_USE_IMMERSIVE_DARK_MODE as u32,
        titlebar_theme.immersive_dark_mode,
    )?;
    set_dwm_color_attribute(
        raw_hwnd,
        DWMWA_CAPTION_COLOR as u32,
        titlebar_theme.background,
    )?;
    set_dwm_color_attribute(
        raw_hwnd,
        DWMWA_BORDER_COLOR as u32,
        titlebar_theme.background,
    )?;
    set_dwm_color_attribute(raw_hwnd, DWMWA_TEXT_COLOR as u32, titlebar_theme.text)?;
    Ok(())
}

#[cfg(not(any(windows, target_os = "macos")))]
fn apply_native_window_titlebar_color(
    _window: &tauri::Window,
    _theme: tauri::Theme,
) -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
fn set_dwm_color_attribute(
    hwnd: windows_sys::Win32::Foundation::HWND,
    attribute: u32,
    color: u32,
) -> Result<(), String> {
    use windows_sys::Win32::Graphics::Dwm::DwmSetWindowAttribute;

    unsafe {
        let result = DwmSetWindowAttribute(
            hwnd,
            attribute,
            (&color as *const u32).cast::<core::ffi::c_void>(),
            std::mem::size_of::<u32>() as u32,
        );
        if result < 0 {
            return Err(format!("DwmSetWindowAttribute failed: HRESULT {result:#x}"));
        }
        Ok(())
    }
}

#[cfg(windows)]
fn set_dwm_bool_attribute(
    hwnd: windows_sys::Win32::Foundation::HWND,
    attribute: u32,
    value: bool,
) -> Result<(), String> {
    use windows_sys::Win32::Graphics::Dwm::DwmSetWindowAttribute;

    let enabled = u32::from(value);
    unsafe {
        let result = DwmSetWindowAttribute(
            hwnd,
            attribute,
            (&enabled as *const u32).cast::<core::ffi::c_void>(),
            std::mem::size_of::<u32>() as u32,
        );
        if result < 0 {
            return Err(format!("DwmSetWindowAttribute failed: HRESULT {result:#x}"));
        }
        Ok(())
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
fn apply_native_titlebar_color<R: tauri::Runtime>(
    _window: &WebviewWindow<R>,
    _theme: tauri::Theme,
) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
fn apply_native_window_titlebar_color(
    window: &tauri::Window,
    theme: tauri::Theme,
) -> Result<(), String> {
    apply_macos_main_window_chrome(window.ns_window().map_err(|err| err.to_string())?, theme)
}

#[cfg(target_os = "macos")]
fn apply_native_titlebar_color<R: tauri::Runtime>(
    window: &WebviewWindow<R>,
    theme: tauri::Theme,
) -> Result<(), String> {
    apply_macos_main_window_chrome(window.ns_window().map_err(|err| err.to_string())?, theme)
}

#[cfg(target_os = "macos")]
fn apply_macos_main_window_chrome(
    ns_window: *mut std::ffi::c_void,
    theme: tauri::Theme,
) -> Result<(), String> {
    use objc2_app_kit::{NSColor, NSWindow, NSWindowTitleVisibility};

    if ns_window.is_null() {
        return Err("main window NSWindow was not available".to_string());
    }

    let (red, green, blue) = macos_main_window_background(theme);
    let background_color = NSColor::colorWithSRGBRed_green_blue_alpha(
        f64::from(red) / 255.0,
        f64::from(green) / 255.0,
        f64::from(blue) / 255.0,
        1.0,
    );

    // Keep AppKit's standard traffic-light controls while removing the
    // duplicate native title text and matching the titlebar to the app shell.
    unsafe {
        let ns_window = &*(ns_window.cast::<NSWindow>());
        ns_window.setTitleVisibility(NSWindowTitleVisibility::Hidden);
        ns_window.setTitlebarAppearsTransparent(true);
        ns_window.setBackgroundColor(Some(&background_color));
        ns_window.setMovableByWindowBackground(true);
    }

    Ok(())
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct NativeTitlebarTheme {
    background: u32,
    text: u32,
    immersive_dark_mode: bool,
}

fn native_titlebar_theme(theme: tauri::Theme) -> NativeTitlebarTheme {
    match theme {
        tauri::Theme::Dark => NativeTitlebarTheme {
            background: APP_DARK_BACKGROUND_COLORREF,
            text: APP_DARK_TITLE_TEXT_COLORREF,
            immersive_dark_mode: true,
        },
        _ => NativeTitlebarTheme {
            background: APP_BACKGROUND_COLORREF,
            text: APP_TITLE_TEXT_COLORREF,
            immersive_dark_mode: false,
        },
    }
}

#[cfg(any(target_os = "macos", test))]
fn macos_main_window_background(theme: tauri::Theme) -> (u8, u8, u8) {
    match theme {
        tauri::Theme::Dark => APP_DARK_BACKGROUND_RGB,
        _ => APP_BACKGROUND_RGB,
    }
}

pub fn prepare_voice_capsule_window(
    window: &impl VoiceCapsuleWindow,
    placement: Option<&VoiceCapsulePlacement>,
) -> Result<(), String> {
    window.set_shadow(false)?;
    window.set_background_color(Color(0, 0, 0, 0))?;
    window.set_always_on_top(true)?;
    window.prepare_native_voice_capsule()?;
    window.set_logical_size(0.0, 0.0)?;
    window.set_logical_size(VOICE_CAPSULE_WIDTH, VOICE_CAPSULE_HEIGHT)?;
    apply_voice_capsule_placement(window, placement)?;
    Ok(())
}

pub fn apply_voice_capsule_placement(
    window: &impl VoiceCapsuleWindow,
    placement: Option<&VoiceCapsulePlacement>,
) -> Result<(), String> {
    let work_area = match window.current_monitor_work_area()? {
        Some(work_area) => work_area,
        None => return Ok(()),
    };
    let position = resolve_voice_capsule_position(
        work_area,
        placement.unwrap_or(&VoiceCapsulePlacement::default()),
    );
    window.set_logical_position(position.x, position.y)
}

pub fn placement_with_current_monitor_metadata(
    window: &impl VoiceCapsuleWindow,
    placement: VoiceCapsulePlacement,
) -> Result<VoiceCapsulePlacement, String> {
    let Some(work_area) = window.current_monitor_work_area()? else {
        return Ok(placement);
    };

    Ok(placement_with_monitor_metadata(placement, work_area))
}

pub fn placement_with_monitor_metadata(
    mut placement: VoiceCapsulePlacement,
    work_area: MonitorWorkArea,
) -> VoiceCapsulePlacement {
    let work_area = sanitize_monitor_work_area(work_area);
    placement.monitor = Some(VoiceCapsuleMonitorMetadata {
        work_area_x: work_area.x,
        work_area_y: work_area.y,
        work_area_width: work_area.width,
        work_area_height: work_area.height,
        scale_factor: Some(work_area.scale_factor),
    });
    placement
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CapsulePosition {
    pub x: f64,
    pub y: f64,
}

pub fn resolve_voice_capsule_position(
    work_area: MonitorWorkArea,
    placement: &VoiceCapsulePlacement,
) -> CapsulePosition {
    let work_area = sanitize_monitor_work_area(work_area);
    let offset_x = placement
        .offset_x
        .unwrap_or_else(|| default_offset_x(placement.anchor));
    let offset_y = placement
        .offset_y
        .unwrap_or_else(|| default_offset_y(placement.anchor));
    let centered_x = work_area.x + (work_area.width - VOICE_CAPSULE_WIDTH) / 2.0;
    let centered_y = work_area.y + (work_area.height - VOICE_CAPSULE_HEIGHT) / 2.0;
    let right_x = work_area.x + work_area.width - VOICE_CAPSULE_WIDTH - offset_x;
    let top_y = work_area.y + offset_y;
    let bottom_y = work_area.y + work_area.height - VOICE_CAPSULE_HEIGHT - offset_y;

    let position = match placement.anchor {
        VoiceCapsuleAnchor::BottomCenter => CapsulePosition {
            x: centered_x + offset_x,
            y: bottom_y,
        },
        VoiceCapsuleAnchor::BottomLeft => CapsulePosition {
            x: work_area.x + offset_x,
            y: bottom_y,
        },
        VoiceCapsuleAnchor::BottomRight => CapsulePosition {
            x: right_x,
            y: bottom_y,
        },
        VoiceCapsuleAnchor::CenterLeft => CapsulePosition {
            x: work_area.x + offset_x,
            y: centered_y + offset_y,
        },
        VoiceCapsuleAnchor::CenterRight => CapsulePosition {
            x: right_x,
            y: centered_y + offset_y,
        },
        VoiceCapsuleAnchor::TopCenter => CapsulePosition {
            x: centered_x + offset_x,
            y: top_y,
        },
    };

    clamp_voice_capsule_position(work_area, position)
}

pub fn show_voice_capsule_window(window: &impl VoiceCapsuleWindow) -> Result<(), String> {
    window.show()
}

fn default_offset_x(anchor: VoiceCapsuleAnchor) -> f64 {
    match anchor {
        VoiceCapsuleAnchor::BottomCenter | VoiceCapsuleAnchor::TopCenter => 0.0,
        VoiceCapsuleAnchor::BottomLeft
        | VoiceCapsuleAnchor::BottomRight
        | VoiceCapsuleAnchor::CenterLeft
        | VoiceCapsuleAnchor::CenterRight => DEFAULT_EDGE_OFFSET,
    }
}

fn default_offset_y(anchor: VoiceCapsuleAnchor) -> f64 {
    match anchor {
        VoiceCapsuleAnchor::CenterLeft | VoiceCapsuleAnchor::CenterRight => 0.0,
        VoiceCapsuleAnchor::BottomCenter
        | VoiceCapsuleAnchor::BottomLeft
        | VoiceCapsuleAnchor::BottomRight
        | VoiceCapsuleAnchor::TopCenter => DEFAULT_EDGE_OFFSET,
    }
}

fn clamp_voice_capsule_position(
    work_area: MonitorWorkArea,
    position: CapsulePosition,
) -> CapsulePosition {
    let max_x = work_area.x + (work_area.width - VOICE_CAPSULE_WIDTH).max(0.0);
    let max_y = work_area.y + (work_area.height - VOICE_CAPSULE_HEIGHT).max(0.0);

    CapsulePosition {
        x: clamp_finite(position.x, work_area.x, max_x),
        y: clamp_finite(position.y, work_area.y, max_y),
    }
}

fn sanitize_monitor_work_area(work_area: MonitorWorkArea) -> MonitorWorkArea {
    MonitorWorkArea {
        x: finite_or_default(work_area.x, 0.0),
        y: finite_or_default(work_area.y, 0.0),
        width: finite_positive_or_default(work_area.width, VOICE_CAPSULE_WIDTH),
        height: finite_positive_or_default(work_area.height, VOICE_CAPSULE_HEIGHT),
        scale_factor: finite_positive_or_default(work_area.scale_factor, 1.0),
    }
}

fn clamp_finite(value: f64, min: f64, max: f64) -> f64 {
    if !value.is_finite() {
        return min;
    }

    value.max(min).min(max)
}

fn finite_or_default(value: f64, fallback: f64) -> f64 {
    if value.is_finite() {
        value
    } else {
        fallback
    }
}

fn finite_positive_or_default(value: f64, fallback: f64) -> f64 {
    if value.is_finite() && value > 0.0 {
        value
    } else {
        fallback
    }
}

const fn colorref_from_rgb(red: u8, green: u8, blue: u8) -> u32 {
    (red as u32) | ((green as u32) << 8) | ((blue as u32) << 16)
}

impl<R: tauri::Runtime> VoiceCapsuleWindow for WebviewWindow<R> {
    fn set_shadow(&self, shadow: bool) -> Result<(), String> {
        WebviewWindow::set_shadow(self, shadow).map_err(|err| err.to_string())
    }

    fn set_background_color(&self, color: Color) -> Result<(), String> {
        WebviewWindow::set_background_color(self, Some(color)).map_err(|err| err.to_string())
    }

    fn set_always_on_top(&self, always_on_top: bool) -> Result<(), String> {
        WebviewWindow::set_always_on_top(self, always_on_top).map_err(|err| err.to_string())
    }

    fn prepare_native_voice_capsule(&self) -> Result<(), String> {
        apply_native_voice_capsule_behavior(self)
    }

    fn set_logical_size(&self, width: f64, height: f64) -> Result<(), String> {
        WebviewWindow::set_size(self, Size::Logical(LogicalSize::new(width, height)))
            .map_err(|err| err.to_string())
    }

    fn current_monitor_work_area(&self) -> Result<Option<MonitorWorkArea>, String> {
        let monitor = self.current_monitor().map_err(|err| err.to_string())?;
        Ok(monitor.map(|monitor| {
            let scale_factor = monitor.scale_factor();
            let work_area = monitor.work_area();

            MonitorWorkArea {
                x: f64::from(work_area.position.x) / scale_factor,
                y: f64::from(work_area.position.y) / scale_factor,
                width: f64::from(work_area.size.width) / scale_factor,
                height: f64::from(work_area.size.height) / scale_factor,
                scale_factor,
            }
        }))
    }

    fn set_logical_position(&self, x: f64, y: f64) -> Result<(), String> {
        WebviewWindow::set_position(self, LogicalPosition::new(x, y)).map_err(|err| err.to_string())
    }

    fn show(&self) -> Result<(), String> {
        WebviewWindow::show(self).map_err(|err| err.to_string())
    }
}

#[cfg(target_os = "macos")]
fn apply_native_voice_capsule_behavior<R: tauri::Runtime>(
    window: &WebviewWindow<R>,
) -> Result<(), String> {
    use objc2_app_kit::{NSFloatingWindowLevel, NSWindow, NSWindowCollectionBehavior};

    let ns_window = window.ns_window().map_err(|err| err.to_string())?;
    if ns_window.is_null() {
        return Err("voice capsule NSWindow was not available".to_string());
    }

    // Tauri's generic always-on-top flag does not cover every macOS Space and
    // full-screen case, so the capsule also opts into AppKit's auxiliary
    // full-screen behavior without changing the app-wide Dock activation policy.
    unsafe {
        let ns_window = &*(ns_window.cast::<NSWindow>());
        let behavior = ns_window.collectionBehavior()
            | NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::FullScreenAuxiliary;
        ns_window.setCollectionBehavior(behavior);
        ns_window.setLevel(NSFloatingWindowLevel);
        ns_window.setHidesOnDeactivate(false);
        ns_window.setCanHide(false);
    }

    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn apply_native_voice_capsule_behavior<R: tauri::Runtime>(
    _window: &WebviewWindow<R>,
) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[derive(Debug, PartialEq)]
    enum Operation {
        SetShadow(bool),
        SetBackgroundColor(Color),
        SetAlwaysOnTop(bool),
        PrepareNativeVoiceCapsule,
        SetLogicalSize(f64, f64),
        SetLogicalPosition(f64, f64),
        Show,
    }

    struct FakeVoiceCapsuleWindow {
        operations: RefCell<Vec<Operation>>,
        work_area: Option<MonitorWorkArea>,
    }

    impl Default for FakeVoiceCapsuleWindow {
        fn default() -> Self {
            Self {
                operations: RefCell::new(Vec::new()),
                work_area: Some(MonitorWorkArea {
                    x: 0.0,
                    y: 0.0,
                    width: 1440.0,
                    height: 860.0,
                    scale_factor: 1.0,
                }),
            }
        }
    }

    impl VoiceCapsuleWindow for FakeVoiceCapsuleWindow {
        fn set_shadow(&self, shadow: bool) -> Result<(), String> {
            self.operations
                .borrow_mut()
                .push(Operation::SetShadow(shadow));
            Ok(())
        }

        fn set_background_color(&self, color: Color) -> Result<(), String> {
            self.operations
                .borrow_mut()
                .push(Operation::SetBackgroundColor(color));
            Ok(())
        }

        fn set_always_on_top(&self, always_on_top: bool) -> Result<(), String> {
            self.operations
                .borrow_mut()
                .push(Operation::SetAlwaysOnTop(always_on_top));
            Ok(())
        }

        fn prepare_native_voice_capsule(&self) -> Result<(), String> {
            self.operations
                .borrow_mut()
                .push(Operation::PrepareNativeVoiceCapsule);
            Ok(())
        }

        fn set_logical_size(&self, width: f64, height: f64) -> Result<(), String> {
            self.operations
                .borrow_mut()
                .push(Operation::SetLogicalSize(width, height));
            Ok(())
        }

        fn current_monitor_work_area(&self) -> Result<Option<MonitorWorkArea>, String> {
            Ok(self.work_area)
        }

        fn set_logical_position(&self, x: f64, y: f64) -> Result<(), String> {
            self.operations
                .borrow_mut()
                .push(Operation::SetLogicalPosition(x, y));
            Ok(())
        }

        fn show(&self) -> Result<(), String> {
            self.operations.borrow_mut().push(Operation::Show);
            Ok(())
        }
    }

    #[test]
    fn primes_voice_capsule_with_transparent_resize_sequence_without_showing_it() {
        let window = FakeVoiceCapsuleWindow::default();

        prepare_voice_capsule_window(&window, None).unwrap();

        assert_eq!(
            *window.operations.borrow(),
            vec![
                Operation::SetShadow(false),
                Operation::SetBackgroundColor(Color(0, 0, 0, 0)),
                Operation::SetAlwaysOnTop(true),
                Operation::PrepareNativeVoiceCapsule,
                Operation::SetLogicalSize(0.0, 0.0),
                Operation::SetLogicalSize(VOICE_CAPSULE_WIDTH, VOICE_CAPSULE_HEIGHT),
                Operation::SetLogicalPosition(692.0, 800.0),
            ]
        );
    }

    #[test]
    fn keeps_the_capsule_as_a_plain_transparent_window_without_native_region_clipping() {
        let window = FakeVoiceCapsuleWindow {
            operations: RefCell::new(Vec::new()),
            work_area: Some(MonitorWorkArea {
                x: 0.0,
                y: 0.0,
                width: 1440.0,
                height: 860.0,
                scale_factor: 1.0,
            }),
        };

        prepare_voice_capsule_window(&window, None).unwrap();

        assert_eq!(
            *window.operations.borrow(),
            vec![
                Operation::SetShadow(false),
                Operation::SetBackgroundColor(Color(0, 0, 0, 0)),
                Operation::SetAlwaysOnTop(true),
                Operation::PrepareNativeVoiceCapsule,
                Operation::SetLogicalSize(0.0, 0.0),
                Operation::SetLogicalSize(VOICE_CAPSULE_WIDTH, VOICE_CAPSULE_HEIGHT),
                Operation::SetLogicalPosition(692.0, 800.0),
            ]
        );
    }

    #[test]
    fn resolves_bottom_center_position_from_the_monitor_work_area() {
        let position = resolve_voice_capsule_position(
            MonitorWorkArea {
                x: 0.0,
                y: 0.0,
                width: 1440.0,
                height: 860.0,
                scale_factor: 1.0,
            },
            &VoiceCapsulePlacement::default(),
        );

        assert_eq!(position, CapsulePosition { x: 692.0, y: 800.0 });
    }

    #[test]
    fn resolves_top_center_position_from_the_monitor_work_area() {
        let placement: VoiceCapsulePlacement = serde_json::from_str(
            r#"{
  "anchor": "topCenter"
}"#,
        )
        .unwrap();

        let position = resolve_voice_capsule_position(
            MonitorWorkArea {
                x: 0.0,
                y: 0.0,
                width: 1440.0,
                height: 860.0,
                scale_factor: 1.0,
            },
            &placement,
        );

        assert_eq!(position, CapsulePosition { x: 692.0, y: 24.0 });
    }

    #[test]
    fn keeps_resolved_voice_capsule_position_inside_the_monitor_work_area() {
        let placement: VoiceCapsulePlacement = serde_json::from_str(
            r#"{
  "anchor": "bottomRight",
  "offsetX": 5000.0,
  "offsetY": -200.0
}"#,
        )
        .unwrap();

        let position = resolve_voice_capsule_position(
            MonitorWorkArea {
                x: 0.0,
                y: 0.0,
                width: 1440.0,
                height: 860.0,
                scale_factor: 1.0,
            },
            &placement,
        );

        assert_eq!(position, CapsulePosition { x: 0.0, y: 824.0 });
    }

    #[test]
    fn invalid_monitor_work_area_resolves_to_a_finite_safe_position() {
        let position = resolve_voice_capsule_position(
            MonitorWorkArea {
                x: f64::NAN,
                y: f64::INFINITY,
                width: -100.0,
                height: f64::NAN,
                scale_factor: f64::NAN,
            },
            &VoiceCapsulePlacement {
                anchor: VoiceCapsuleAnchor::BottomRight,
                offset_x: Some(f64::INFINITY),
                offset_y: Some(f64::NAN),
                monitor: None,
            },
        );

        assert_eq!(position, CapsulePosition { x: 0.0, y: 0.0 });
    }

    #[test]
    fn saved_voice_capsule_placement_records_current_monitor_metadata() {
        let placement = VoiceCapsulePlacement {
            anchor: VoiceCapsuleAnchor::BottomRight,
            offset_x: Some(24.0),
            offset_y: Some(32.0),
            monitor: None,
        };

        let enriched = placement_with_monitor_metadata(
            placement,
            MonitorWorkArea {
                x: 10.0,
                y: 20.0,
                width: 1200.0,
                height: 800.0,
                scale_factor: 1.25,
            },
        );
        let metadata = enriched.monitor.unwrap();

        assert_eq!(metadata.work_area_x, 10.0);
        assert_eq!(metadata.work_area_y, 20.0);
        assert_eq!(metadata.work_area_width, 1200.0);
        assert_eq!(metadata.work_area_height, 800.0);
        assert_eq!(metadata.scale_factor, Some(1.25));
    }

    #[test]
    fn shows_voice_capsule_only_when_explicitly_requested() {
        let window = FakeVoiceCapsuleWindow::default();

        show_voice_capsule_window(&window).unwrap();

        assert_eq!(*window.operations.borrow(), vec![Operation::Show]);
    }

    #[test]
    fn converts_css_rgb_to_windows_colorref_order() {
        assert_eq!(colorref_from_rgb(0xF8, 0xFA, 0xFC), 0x00FCFAF8);
        assert_eq!(APP_BACKGROUND_COLORREF, 0x00FCFAF8);
    }

    #[test]
    fn maps_light_and_dark_themes_to_native_titlebar_colors() {
        assert_eq!(
            native_titlebar_theme(tauri::Theme::Light),
            NativeTitlebarTheme {
                background: APP_BACKGROUND_COLORREF,
                text: APP_TITLE_TEXT_COLORREF,
                immersive_dark_mode: false,
            },
        );
        assert_eq!(
            native_titlebar_theme(tauri::Theme::Dark),
            NativeTitlebarTheme {
                background: APP_DARK_BACKGROUND_COLORREF,
                text: APP_DARK_TITLE_TEXT_COLORREF,
                immersive_dark_mode: true,
            },
        );
    }

    #[test]
    fn maps_light_and_dark_themes_to_macos_window_backgrounds() {
        assert_eq!(
            macos_main_window_background(tauri::Theme::Light),
            APP_BACKGROUND_RGB,
        );
        assert_eq!(
            macos_main_window_background(tauri::Theme::Dark),
            APP_DARK_BACKGROUND_RGB,
        );
    }
}
