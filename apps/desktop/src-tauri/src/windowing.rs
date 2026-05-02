use tauri::window::Color;
use tauri::{LogicalSize, Size, WebviewWindow};

const VOICE_CAPSULE_WIDTH: f64 = 48.0;
const VOICE_CAPSULE_HEIGHT: f64 = 28.0;
const VOICE_CAPSULE_CORNER_RADIUS: i32 = 28;

pub trait VoiceCapsuleWindow {
    fn set_shadow(&self, shadow: bool) -> Result<(), String>;
    fn set_background_color(&self, color: Color) -> Result<(), String>;
    fn set_logical_size(&self, width: f64, height: f64) -> Result<(), String>;
    fn apply_capsule_shape(&self, width: i32, height: i32, radius: i32) -> Result<(), String>;
    fn scale_factor(&self) -> Result<f64, String>;
    fn show(&self) -> Result<(), String>;
}

pub fn prepare_voice_capsule_window(window: &impl VoiceCapsuleWindow) -> Result<(), String> {
    window.set_shadow(false)?;
    window.set_background_color(Color(0, 0, 0, 0))?;
    window.set_logical_size(0.0, 0.0)?;
    window.set_logical_size(VOICE_CAPSULE_WIDTH, VOICE_CAPSULE_HEIGHT)?;
    let scale_factor = window.scale_factor()?;
    let physical_width = scaled_dimension(VOICE_CAPSULE_WIDTH, scale_factor);
    let physical_height = scaled_dimension(VOICE_CAPSULE_HEIGHT, scale_factor);
    let physical_radius = scaled_dimension(f64::from(VOICE_CAPSULE_CORNER_RADIUS), scale_factor);
    window.apply_capsule_shape(physical_width, physical_height, physical_radius)?;
    Ok(())
}

pub fn show_voice_capsule_window(window: &impl VoiceCapsuleWindow) -> Result<(), String> {
    window.show()
}

fn scaled_dimension(value: f64, scale_factor: f64) -> i32 {
    (value * scale_factor).round() as i32
}

impl<R: tauri::Runtime> VoiceCapsuleWindow for WebviewWindow<R> {
    fn set_shadow(&self, shadow: bool) -> Result<(), String> {
        WebviewWindow::set_shadow(self, shadow).map_err(|err| err.to_string())
    }

    fn set_background_color(&self, color: Color) -> Result<(), String> {
        WebviewWindow::set_background_color(self, Some(color)).map_err(|err| err.to_string())
    }

    fn set_logical_size(&self, width: f64, height: f64) -> Result<(), String> {
        WebviewWindow::set_size(self, Size::Logical(LogicalSize::new(width, height)))
            .map_err(|err| err.to_string())
    }

    fn apply_capsule_shape(&self, width: i32, height: i32, radius: i32) -> Result<(), String> {
        #[cfg(windows)]
        {
            use std::ptr::null_mut;
            use windows_sys::Win32::Graphics::Gdi::{
                CreateRoundRectRgn, DeleteObject, SetWindowRgn,
            };

            let hwnd = self.hwnd().map_err(|err| err.to_string())?.0 as *mut std::ffi::c_void;
            let region = unsafe { CreateRoundRectRgn(0, 0, width, height, radius, radius) };

            if region == null_mut() {
                return Err("failed to create voice capsule region".to_string());
            }

            let applied = unsafe { SetWindowRgn(hwnd, region, 1) };
            if applied == 0 {
                unsafe {
                    let _ = DeleteObject(region as _);
                }
                return Err("failed to apply voice capsule region".to_string());
            }
        }

        #[cfg(not(windows))]
        {
            let _ = (width, height, radius);
        }

        Ok(())
    }

    fn scale_factor(&self) -> Result<f64, String> {
        WebviewWindow::scale_factor(self).map_err(|err| err.to_string())
    }

    fn show(&self) -> Result<(), String> {
        WebviewWindow::show(self).map_err(|err| err.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[derive(Debug, PartialEq)]
    enum Operation {
        SetShadow(bool),
        SetBackgroundColor(Color),
        SetLogicalSize(f64, f64),
        ApplyCapsuleShape(i32, i32, i32),
        Show,
    }

    #[derive(Default)]
    struct FakeVoiceCapsuleWindow {
        operations: RefCell<Vec<Operation>>,
        scale_factor: f64,
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

        fn set_logical_size(&self, width: f64, height: f64) -> Result<(), String> {
            self.operations
                .borrow_mut()
                .push(Operation::SetLogicalSize(width, height));
            Ok(())
        }

        fn apply_capsule_shape(&self, width: i32, height: i32, radius: i32) -> Result<(), String> {
            self.operations
                .borrow_mut()
                .push(Operation::ApplyCapsuleShape(width, height, radius));
            Ok(())
        }

        fn scale_factor(&self) -> Result<f64, String> {
            Ok(if self.scale_factor == 0.0 {
                1.0
            } else {
                self.scale_factor
            })
        }

        fn show(&self) -> Result<(), String> {
            self.operations.borrow_mut().push(Operation::Show);
            Ok(())
        }
    }

    #[test]
    fn primes_voice_capsule_with_transparent_resize_sequence_without_showing_it() {
        let window = FakeVoiceCapsuleWindow::default();

        prepare_voice_capsule_window(&window).unwrap();

        assert_eq!(
            *window.operations.borrow(),
            vec![
                Operation::SetShadow(false),
                Operation::SetBackgroundColor(Color(0, 0, 0, 0)),
                Operation::SetLogicalSize(0.0, 0.0),
                Operation::SetLogicalSize(VOICE_CAPSULE_WIDTH, VOICE_CAPSULE_HEIGHT),
                Operation::ApplyCapsuleShape(
                    scaled_dimension(VOICE_CAPSULE_WIDTH, 1.0),
                    scaled_dimension(VOICE_CAPSULE_HEIGHT, 1.0),
                    VOICE_CAPSULE_CORNER_RADIUS,
                ),
            ]
        );
    }

    #[test]
    fn uses_physical_pixels_for_voice_capsule_region() {
        let window = FakeVoiceCapsuleWindow {
            operations: RefCell::new(Vec::new()),
            scale_factor: 1.5,
        };

        prepare_voice_capsule_window(&window).unwrap();

        assert!(window
            .operations
            .borrow()
            .contains(&Operation::ApplyCapsuleShape(72, 42, 42)));
    }

    #[test]
    fn shows_voice_capsule_only_when_explicitly_requested() {
        let window = FakeVoiceCapsuleWindow::default();

        show_voice_capsule_window(&window).unwrap();

        assert_eq!(*window.operations.borrow(), vec![Operation::Show]);
    }
}
