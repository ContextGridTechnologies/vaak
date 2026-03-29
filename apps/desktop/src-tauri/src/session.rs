use crate::platform;
use crate::platform::common::FocusedFieldInfo;
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime};

#[cfg(windows)]
use std::{thread, time::Duration};
#[cfg(windows)]
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN,
};

const HOTKEY_EVENT: &str = "bluevoice://session-hotkey";
const DICTATION_BINDING_LABEL: &str = "Ctrl+Win";
const COMMAND_BINDING_LABEL: &str = "Ctrl+Win+Alt";

#[derive(Default)]
pub struct SessionSnapshot {
    pub last_dictation_target: Option<FocusedFieldInfo>,
    pub monitor_started: bool,
}

#[derive(Default)]
pub struct SessionStore {
    inner: Mutex<SessionSnapshot>,
}

impl SessionStore {
    pub fn set_dictation_target(&self, field: FocusedFieldInfo) {
        if let Ok(mut snapshot) = self.inner.lock() {
            snapshot.last_dictation_target = Some(field);
        }
    }

    pub fn get_dictation_target_stable_id(&self) -> Option<String> {
        self.inner
            .lock()
            .ok()
            .and_then(|snapshot| snapshot.last_dictation_target.clone())
            .map(|field| field.stable_id)
    }

    pub fn hotkey_bindings(&self) -> HotkeyBindings {
        HotkeyBindings {
            dictation: DICTATION_BINDING_LABEL.to_string(),
            command: COMMAND_BINDING_LABEL.to_string(),
        }
    }

    fn mark_monitor_started(&self) -> bool {
        if let Ok(mut snapshot) = self.inner.lock() {
            if snapshot.monitor_started {
                return false;
            }
            snapshot.monitor_started = true;
            return true;
        }
        false
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeySessionEvent {
    pub mode: String,
    pub phase: String,
    pub shortcut: String,
    pub field: Option<FocusedFieldInfo>,
    pub error: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyBindings {
    pub dictation: String,
    pub command: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ActiveMode {
    Idle,
    Dictation,
    Command,
}

pub fn start_hotkey_monitor<R: Runtime + Send + Sync + 'static>(
    app: &AppHandle<R>,
    store: &SessionStore,
) {
    if !store.mark_monitor_started() {
        return;
    }

    #[cfg(windows)]
    {
        let app = app.clone();
        thread::spawn(move || {
            monitor_loop(app);
        });
    }

    #[cfg(not(windows))]
    {
        let _ = app;
        let _ = store;
    }
}

#[cfg(windows)]
fn monitor_loop<R: Runtime>(app: AppHandle<R>) {
    let mut current_mode = ActiveMode::Idle;

    loop {
        let desired_mode = detect_mode();
        if desired_mode != current_mode {
            transition_mode(&app, current_mode, desired_mode);
            current_mode = desired_mode;
        }
        thread::sleep(Duration::from_millis(20));
    }
}

#[cfg(windows)]
fn detect_mode() -> ActiveMode {
    let ctrl_down = is_key_down(VK_CONTROL.0 as i32);
    let win_down = is_key_down(VK_LWIN.0 as i32) || is_key_down(VK_RWIN.0 as i32);
    let alt_down = is_key_down(VK_MENU.0 as i32);

    if ctrl_down && win_down && alt_down {
        ActiveMode::Command
    } else if ctrl_down && win_down {
        ActiveMode::Dictation
    } else {
        ActiveMode::Idle
    }
}

#[cfg(windows)]
fn is_key_down(vk: i32) -> bool {
    let state = unsafe { GetAsyncKeyState(vk) };
    (state as u16 & 0x8000) != 0
}

#[cfg(windows)]
fn transition_mode<R: Runtime>(app: &AppHandle<R>, from: ActiveMode, to: ActiveMode) {
    match from {
        ActiveMode::Dictation => emit_dictation_stop(app),
        ActiveMode::Command => emit_command_stop(app),
        ActiveMode::Idle => {}
    }

    match to {
        ActiveMode::Dictation => emit_dictation_start(app),
        ActiveMode::Command => emit_command_start(app),
        ActiveMode::Idle => {}
    }
}

#[cfg(windows)]
fn emit_dictation_start<R: Runtime>(app: &AppHandle<R>) {
    let payload = match platform::get_focused_field() {
        Ok(field) => {
            let session = app.state::<SessionStore>();
            session.set_dictation_target(field.clone());
            HotkeySessionEvent {
                mode: "dictation".to_string(),
                phase: "start".to_string(),
                shortcut: DICTATION_BINDING_LABEL.to_string(),
                field: Some(field),
                error: None,
            }
        }
        Err(err) => HotkeySessionEvent {
            mode: "dictation".to_string(),
            phase: "start".to_string(),
            shortcut: DICTATION_BINDING_LABEL.to_string(),
            field: None,
            error: Some(format!("{}: {}", err.code, err.message)),
        },
    };

    let _ = app.emit(HOTKEY_EVENT, payload);
}

#[cfg(windows)]
fn emit_dictation_stop<R: Runtime>(app: &AppHandle<R>) {
    let _ = app.emit(
        HOTKEY_EVENT,
        HotkeySessionEvent {
            mode: "dictation".to_string(),
            phase: "stop".to_string(),
            shortcut: DICTATION_BINDING_LABEL.to_string(),
            field: None,
            error: None,
        },
    );
}

#[cfg(windows)]
fn emit_command_start<R: Runtime>(app: &AppHandle<R>) {
    let _ = app.emit(
        HOTKEY_EVENT,
        HotkeySessionEvent {
            mode: "command".to_string(),
            phase: "start".to_string(),
            shortcut: COMMAND_BINDING_LABEL.to_string(),
            field: None,
            error: None,
        },
    );
}

#[cfg(windows)]
fn emit_command_stop<R: Runtime>(app: &AppHandle<R>) {
    let _ = app.emit(
        HOTKEY_EVENT,
        HotkeySessionEvent {
            mode: "command".to_string(),
            phase: "stop".to_string(),
            shortcut: COMMAND_BINDING_LABEL.to_string(),
            field: None,
            error: None,
        },
    );
}
