use crate::storage::{VoiceCapsuleAnchor, VoiceCapsulePlacement};
use tauri::window::Color;
use tauri::{LogicalPosition, LogicalSize, Size, WebviewWindow};

const VOICE_CAPSULE_WIDTH: f64 = 56.0;
const VOICE_CAPSULE_HEIGHT: f64 = 36.0;
const DEFAULT_EDGE_OFFSET: f64 = 24.0;

pub trait VoiceCapsuleWindow {
    fn set_shadow(&self, shadow: bool) -> Result<(), String>;
    fn set_background_color(&self, color: Color) -> Result<(), String>;
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
}

pub fn prepare_voice_capsule_window(
    window: &impl VoiceCapsuleWindow,
    placement: Option<&VoiceCapsulePlacement>,
) -> Result<(), String> {
    window.set_shadow(false)?;
    window.set_background_color(Color(0, 0, 0, 0))?;
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

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CapsulePosition {
    pub x: f64,
    pub y: f64,
}

pub fn resolve_voice_capsule_position(
    work_area: MonitorWorkArea,
    placement: &VoiceCapsulePlacement,
) -> CapsulePosition {
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

    match placement.anchor {
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
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[derive(Debug, PartialEq)]
    enum Operation {
        SetShadow(bool),
        SetBackgroundColor(Color),
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
            }),
        };

        prepare_voice_capsule_window(&window, None).unwrap();

        assert_eq!(
            *window.operations.borrow(),
            vec![
                Operation::SetShadow(false),
                Operation::SetBackgroundColor(Color(0, 0, 0, 0)),
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
            },
            &placement,
        );

        assert_eq!(position, CapsulePosition { x: 692.0, y: 24.0 });
    }

    #[test]
    fn shows_voice_capsule_only_when_explicitly_requested() {
        let window = FakeVoiceCapsuleWindow::default();

        show_voice_capsule_window(&window).unwrap();

        assert_eq!(*window.operations.borrow(), vec![Operation::Show]);
    }
}
