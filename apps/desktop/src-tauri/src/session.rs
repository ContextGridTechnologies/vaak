use crate::platform;
use crate::platform::common::FocusedFieldInfo;
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime};

#[cfg(target_os = "macos")]
mod macos_hotkey;
#[cfg(target_os = "macos")]
use std::thread;
#[cfg(windows)]
use std::{thread, time::Duration};
#[cfg(windows)]
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
};

const HOTKEY_EVENT: &str = "vaak://session-hotkey";
#[cfg(target_os = "macos")]
pub const DEFAULT_DICTATION_BINDING_LABEL: &str = "Control+Command";
#[cfg(not(target_os = "macos"))]
pub const DEFAULT_DICTATION_BINDING_LABEL: &str = "Ctrl+Win";

#[derive(Clone, Debug)]
struct ModifierHotkey {
    ctrl: bool,
    shift: bool,
    win: bool,
    alt: bool,
}

impl ModifierHotkey {
    fn command_variant(&self) -> Self {
        Self {
            ctrl: self.ctrl,
            shift: self.shift,
            win: self.win,
            alt: true,
        }
    }

    fn label(&self) -> String {
        let mut parts = Vec::new();
        if self.ctrl {
            #[cfg(target_os = "macos")]
            parts.push("Control");
            #[cfg(not(target_os = "macos"))]
            parts.push("Ctrl");
        }
        if self.shift {
            parts.push("Shift");
        }
        if self.win {
            #[cfg(target_os = "macos")]
            parts.push("Command");
            #[cfg(not(target_os = "macos"))]
            parts.push("Win");
        }
        if self.alt {
            #[cfg(target_os = "macos")]
            parts.push("Option");
            #[cfg(not(target_os = "macos"))]
            parts.push("Alt");
        }
        parts.join("+")
    }

    #[cfg(windows)]
    fn is_down(&self) -> bool {
        (!self.ctrl || is_ctrl_down())
            && (!self.shift || is_shift_down())
            && (!self.win || is_win_down())
            && (!self.alt || is_alt_down())
    }
}

pub struct SessionSnapshot {
    pub last_dictation_target: Option<FocusedFieldInfo>,
    pub monitor_started: bool,
    pub dictation_binding_label: String,
}

impl Default for SessionSnapshot {
    fn default() -> Self {
        Self {
            last_dictation_target: None,
            monitor_started: false,
            dictation_binding_label: DEFAULT_DICTATION_BINDING_LABEL.to_string(),
        }
    }
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

    pub fn get_dictation_target(&self) -> Option<FocusedFieldInfo> {
        self.inner
            .lock()
            .ok()
            .and_then(|snapshot| snapshot.last_dictation_target.clone())
    }

    #[allow(dead_code)]
    pub fn get_dictation_target_stable_id(&self) -> Option<String> {
        self.get_dictation_target().map(|field| field.stable_id)
    }

    pub fn hotkey_bindings(&self) -> HotkeyBindings {
        let dictation = self
            .inner
            .lock()
            .ok()
            .map(|snapshot| snapshot.dictation_binding_label.clone())
            .unwrap_or_else(|| DEFAULT_DICTATION_BINDING_LABEL.to_string());
        let command = command_binding_label(&dictation)
            .unwrap_or_else(|_| format!("{DEFAULT_DICTATION_BINDING_LABEL}+Alt"));

        HotkeyBindings { dictation, command }
    }

    pub fn set_dictation_hotkey(&self, shortcut: &str) -> Result<HotkeyBindings, String> {
        let normalized = normalize_dictation_hotkey_label(shortcut)?;

        if let Ok(mut snapshot) = self.inner.lock() {
            snapshot.dictation_binding_label = normalized.clone();
        }

        Ok(HotkeyBindings {
            command: command_binding_label(&normalized)?,
            dictation: normalized,
        })
    }

    pub fn dictation_hotkey(&self) -> String {
        self.inner
            .lock()
            .ok()
            .map(|snapshot| snapshot.dictation_binding_label.clone())
            .unwrap_or_else(|| DEFAULT_DICTATION_BINDING_LABEL.to_string())
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

pub fn normalize_dictation_hotkey_label(shortcut: &str) -> Result<String, String> {
    let hotkey = parse_hotkey(shortcut, false)?;
    validate_dictation_hotkey(&hotkey)?;
    Ok(hotkey.label())
}

pub fn command_binding_label(dictation: &str) -> Result<String, String> {
    let hotkey = parse_hotkey(dictation, false)?;
    validate_dictation_hotkey(&hotkey)?;
    Ok(hotkey.command_variant().label())
}

pub fn start_hotkey_monitor<R: Runtime + 'static>(app: &AppHandle<R>, store: &SessionStore) {
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

    #[cfg(target_os = "macos")]
    {
        let app = app.clone();
        thread::spawn(move || {
            macos_hotkey::monitor_loop(app);
        });
    }

    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = app;
        let _ = store;
    }
}

#[cfg(windows)]
fn monitor_loop<R: Runtime>(app: AppHandle<R>) {
    let mut current_mode = ActiveMode::Idle;

    loop {
        let session = app.state::<SessionStore>();
        let desired_mode = detect_mode(&session.dictation_hotkey());
        if desired_mode != current_mode {
            transition_mode(&app, current_mode, desired_mode);
            current_mode = desired_mode;
        }
        thread::sleep(Duration::from_millis(20));
    }
}

#[cfg(windows)]
fn detect_mode(dictation: &str) -> ActiveMode {
    let dictation_hotkey = match parse_hotkey(dictation, false) {
        Ok(hotkey) => hotkey,
        Err(_) => return ActiveMode::Idle,
    };
    let command_hotkey = dictation_hotkey.command_variant();

    if command_hotkey.is_down() {
        ActiveMode::Command
    } else if dictation_hotkey.is_down() {
        ActiveMode::Dictation
    } else {
        ActiveMode::Idle
    }
}

fn parse_hotkey(shortcut: &str, allow_alt: bool) -> Result<ModifierHotkey, String> {
    let mut hotkey = ModifierHotkey {
        ctrl: false,
        shift: false,
        win: false,
        alt: false,
    };

    for token in shortcut
        .split('+')
        .map(str::trim)
        .filter(|token| !token.is_empty())
    {
        match token.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => hotkey.ctrl = true,
            "shift" => hotkey.shift = true,
            #[cfg(target_os = "macos")]
            "cmd" | "command" | "meta" | "super" | "win" | "windows" => hotkey.win = true,
            #[cfg(not(target_os = "macos"))]
            "win" | "windows" | "meta" | "super" => hotkey.win = true,
            #[cfg(target_os = "macos")]
            "option" if allow_alt => hotkey.alt = true,
            #[cfg(target_os = "macos")]
            "option" => return Err("Option is reserved for command mode.".to_string()),
            "alt" if allow_alt => hotkey.alt = true,
            #[cfg(target_os = "macos")]
            "alt" => return Err("Option is reserved for command mode.".to_string()),
            #[cfg(not(target_os = "macos"))]
            "alt" => return Err("Alt is reserved for command mode.".to_string()),
            _ => {
                #[cfg(target_os = "macos")]
                return Err(
                    "Use only Control, Shift, and Command for the dictation shortcut.".to_string(),
                );
                #[cfg(not(target_os = "macos"))]
                return Err(
                    "Use only Ctrl, Shift, and Windows for the dictation shortcut.".to_string(),
                );
            }
        }
    }

    Ok(hotkey)
}

fn validate_dictation_hotkey(hotkey: &ModifierHotkey) -> Result<(), String> {
    let count = usize::from(hotkey.ctrl) + usize::from(hotkey.shift) + usize::from(hotkey.win);

    if count < 2 {
        return Err("Choose at least two modifier keys.".to_string());
    }

    Ok(())
}

#[cfg(windows)]
fn is_key_down(vk: i32) -> bool {
    let state = unsafe { GetAsyncKeyState(vk) };
    (state as u16 & 0x8000) != 0
}

#[cfg(windows)]
fn is_ctrl_down() -> bool {
    is_key_down(VK_CONTROL.0 as i32)
}

#[cfg(windows)]
fn is_shift_down() -> bool {
    is_key_down(VK_SHIFT.0 as i32)
}

#[cfg(windows)]
fn is_win_down() -> bool {
    is_key_down(VK_LWIN.0 as i32) || is_key_down(VK_RWIN.0 as i32)
}

#[cfg(windows)]
fn is_alt_down() -> bool {
    is_key_down(VK_MENU.0 as i32)
}

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

fn emit_dictation_start<R: Runtime>(app: &AppHandle<R>) {
    let bindings = app.state::<SessionStore>().hotkey_bindings();
    let payload = match platform::get_focused_field() {
        Ok(field) => {
            let session = app.state::<SessionStore>();
            session.set_dictation_target(field.clone());
            HotkeySessionEvent {
                mode: "dictation".to_string(),
                phase: "start".to_string(),
                shortcut: bindings.dictation,
                field: Some(field),
                error: None,
            }
        }
        Err(err) => HotkeySessionEvent {
            mode: "dictation".to_string(),
            phase: "start".to_string(),
            shortcut: bindings.dictation,
            field: None,
            error: Some(format!("{}: {}", err.code, err.message)),
        },
    };

    emit_hotkey_event(app, payload);
}

fn emit_dictation_stop<R: Runtime>(app: &AppHandle<R>) {
    let shortcut = app.state::<SessionStore>().hotkey_bindings().dictation;
    emit_hotkey_event(
        app,
        HotkeySessionEvent {
            mode: "dictation".to_string(),
            phase: "stop".to_string(),
            shortcut,
            field: None,
            error: None,
        },
    );
}

fn emit_command_start<R: Runtime>(app: &AppHandle<R>) {
    let shortcut = app.state::<SessionStore>().hotkey_bindings().command;
    emit_hotkey_event(
        app,
        HotkeySessionEvent {
            mode: "command".to_string(),
            phase: "start".to_string(),
            shortcut,
            field: None,
            error: None,
        },
    );
}

fn emit_command_stop<R: Runtime>(app: &AppHandle<R>) {
    let shortcut = app.state::<SessionStore>().hotkey_bindings().command;
    emit_hotkey_event(
        app,
        HotkeySessionEvent {
            mode: "command".to_string(),
            phase: "stop".to_string(),
            shortcut,
            field: None,
            error: None,
        },
    );
}

fn emit_hotkey_event<R: Runtime>(app: &AppHandle<R>, payload: HotkeySessionEvent) {
    if let Err(err) = app.emit(HOTKEY_EVENT, payload) {
        log::warn!("failed to emit hotkey session event: {err}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_modifier_only_dictation_hotkeys() {
        #[cfg(not(target_os = "macos"))]
        {
            assert_eq!(
                normalize_dictation_hotkey_label(" win + ctrl ").unwrap(),
                "Ctrl+Win"
            );
            assert_eq!(
                normalize_dictation_hotkey_label("shift+ctrl").unwrap(),
                "Ctrl+Shift"
            );
        }

        #[cfg(target_os = "macos")]
        {
            assert_eq!(
                normalize_dictation_hotkey_label(" cmd + ctrl ").unwrap(),
                "Control+Command"
            );
            assert_eq!(
                normalize_dictation_hotkey_label("shift+control").unwrap(),
                "Control+Shift"
            );
            assert_eq!(
                normalize_dictation_hotkey_label("meta+control").unwrap(),
                "Control+Command"
            );
        }
    }

    #[test]
    fn rejects_invalid_dictation_hotkeys() {
        assert!(normalize_dictation_hotkey_label("Ctrl").is_err());
        assert!(normalize_dictation_hotkey_label("Ctrl+Alt").is_err());
        assert!(normalize_dictation_hotkey_label("Ctrl+A").is_err());
    }

    #[test]
    fn derives_command_binding_from_dictation_binding() {
        #[cfg(not(target_os = "macos"))]
        {
            assert_eq!(command_binding_label("Ctrl+Win").unwrap(), "Ctrl+Win+Alt");
            assert_eq!(
                command_binding_label("Ctrl+Shift").unwrap(),
                "Ctrl+Shift+Alt"
            );
        }

        #[cfg(target_os = "macos")]
        {
            assert_eq!(
                command_binding_label("Control+Command").unwrap(),
                "Control+Command+Option"
            );
            assert_eq!(
                command_binding_label("Control+Shift").unwrap(),
                "Control+Shift+Option"
            );
        }
    }
}
