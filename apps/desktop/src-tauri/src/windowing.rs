use tauri::window::Color;
use tauri::{LogicalSize, Size, WebviewWindow};

const VOICE_CAPSULE_WIDTH: f64 = 56.0;
const VOICE_CAPSULE_HEIGHT: f64 = 36.0;

pub trait VoiceCapsuleWindow {
    fn set_shadow(&self, shadow: bool) -> Result<(), String>;
    fn set_background_color(&self, color: Color) -> Result<(), String>;
    fn set_logical_size(&self, width: f64, height: f64) -> Result<(), String>;
    fn show(&self) -> Result<(), String>;
}

pub fn prepare_voice_capsule_window(window: &impl VoiceCapsuleWindow) -> Result<(), String> {
    window.set_shadow(false)?;
    window.set_background_color(Color(0, 0, 0, 0))?;
    window.set_logical_size(0.0, 0.0)?;
    window.set_logical_size(VOICE_CAPSULE_WIDTH, VOICE_CAPSULE_HEIGHT)?;
    Ok(())
}

pub fn show_voice_capsule_window(window: &impl VoiceCapsuleWindow) -> Result<(), String> {
    window.show()
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
        Show,
    }

    #[derive(Default)]
    struct FakeVoiceCapsuleWindow {
        operations: RefCell<Vec<Operation>>,
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
            ]
        );
    }

    #[test]
    fn keeps_the_capsule_as_a_plain_transparent_window_without_native_region_clipping() {
        let window = FakeVoiceCapsuleWindow {
            operations: RefCell::new(Vec::new()),
        };

        prepare_voice_capsule_window(&window).unwrap();

        assert_eq!(
            *window.operations.borrow(),
            vec![
                Operation::SetShadow(false),
                Operation::SetBackgroundColor(Color(0, 0, 0, 0)),
                Operation::SetLogicalSize(0.0, 0.0),
                Operation::SetLogicalSize(VOICE_CAPSULE_WIDTH, VOICE_CAPSULE_HEIGHT),
            ]
        );
    }

    #[test]
    fn shows_voice_capsule_only_when_explicitly_requested() {
        let window = FakeVoiceCapsuleWindow::default();

        show_voice_capsule_window(&window).unwrap();

        assert_eq!(*window.operations.borrow(), vec![Operation::Show]);
    }
}
