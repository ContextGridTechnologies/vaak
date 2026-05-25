use super::{parse_hotkey, transition_mode, ActiveMode, ModifierHotkey, SessionStore};
use std::ffi::{c_void, CString};
use std::os::raw::c_char;
use std::ptr;
use tauri::{AppHandle, Manager, Runtime};

type CFMachPortRef = *const c_void;
type CFRunLoopRef = *const c_void;
type CFRunLoopSourceRef = *const c_void;
type CFStringRef = *const c_void;
type CFStringEncoding = u32;
type CFTypeRef = *const c_void;
type CGEventRef = *const c_void;
type CGEventTapProxy = *const c_void;
type CGEventType = u32;
type CGEventMask = u64;
type CGEventFlags = u64;

const K_CG_EVENT_FLAGS_CHANGED: CGEventType = 12;
const K_CG_HEAD_INSERT_EVENT_TAP: u32 = 0;
const K_CG_SESSION_EVENT_TAP: u32 = 1;
const K_CG_EVENT_TAP_OPTION_LISTEN_ONLY: u32 = 1;
const K_CG_EVENT_FLAG_MASK_SHIFT: CGEventFlags = 0x0002_0000;
const K_CG_EVENT_FLAG_MASK_CONTROL: CGEventFlags = 0x0004_0000;
const K_CG_EVENT_FLAG_MASK_ALTERNATE: CGEventFlags = 0x0008_0000;
const K_CG_EVENT_FLAG_MASK_COMMAND: CGEventFlags = 0x0010_0000;
const K_CF_STRING_ENCODING_UTF8: CFStringEncoding = 0x0800_0100;

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn CGEventTapCreate(
        tap: u32,
        place: u32,
        options: u32,
        events_of_interest: CGEventMask,
        callback: extern "C" fn(
            CGEventTapProxy,
            CGEventType,
            CGEventRef,
            *mut c_void,
        ) -> CGEventRef,
        user_info: *mut c_void,
    ) -> CFMachPortRef;
    fn CGEventGetFlags(event: CGEventRef) -> CGEventFlags;
}

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFMachPortCreateRunLoopSource(
        allocator: *const c_void,
        port: CFMachPortRef,
        order: isize,
    ) -> CFRunLoopSourceRef;
    fn CFRunLoopAddSource(rl: CFRunLoopRef, source: CFRunLoopSourceRef, mode: CFStringRef);
    fn CFRunLoopGetCurrent() -> CFRunLoopRef;
    fn CFRunLoopRun();
    fn CFRelease(cf: CFTypeRef);
    fn CFStringCreateWithCString(
        alloc: *const c_void,
        c_str: *const c_char,
        encoding: CFStringEncoding,
    ) -> CFStringRef;
}

struct MonitorState<R: Runtime> {
    app: AppHandle<R>,
    current_mode: ActiveMode,
}

pub(super) fn monitor_loop<R: Runtime>(app: AppHandle<R>) {
    let state = Box::into_raw(Box::new(MonitorState {
        app,
        current_mode: ActiveMode::Idle,
    }));
    let mask = 1_u64 << K_CG_EVENT_FLAGS_CHANGED;
    let tap = unsafe {
        CGEventTapCreate(
            K_CG_SESSION_EVENT_TAP,
            K_CG_HEAD_INSERT_EVENT_TAP,
            K_CG_EVENT_TAP_OPTION_LISTEN_ONLY,
            mask,
            event_tap_callback::<R>,
            state.cast(),
        )
    };

    if tap.is_null() {
        unsafe {
            drop(Box::from_raw(state));
        }
        log::warn!("failed to start macOS hotkey event tap; Input Monitoring may be denied");
        return;
    }

    let source = unsafe { CFMachPortCreateRunLoopSource(ptr::null(), tap, 0) };
    if source.is_null() {
        unsafe {
            drop(Box::from_raw(state));
        }
        log::warn!("failed to create macOS hotkey run loop source");
        return;
    }

    let Some(default_mode) = CfString::new("kCFRunLoopDefaultMode") else {
        unsafe {
            drop(Box::from_raw(state));
        }
        log::warn!("failed to create macOS hotkey run loop mode string");
        return;
    };

    // The event tap runs on its own monitor thread. Default mode is enough
    // because it is not coupled to AppKit UI tracking.
    unsafe {
        CFRunLoopAddSource(CFRunLoopGetCurrent(), source, default_mode.as_ptr());
        CFRunLoopRun();
    }
}

extern "C" fn event_tap_callback<R: Runtime>(
    _proxy: CGEventTapProxy,
    event_type: CGEventType,
    event: CGEventRef,
    user_info: *mut c_void,
) -> CGEventRef {
    if event_type != K_CG_EVENT_FLAGS_CHANGED || user_info.is_null() {
        return event;
    }

    let state = unsafe { &mut *user_info.cast::<MonitorState<R>>() };
    let flags = unsafe { CGEventGetFlags(event) };
    let session = state.app.state::<SessionStore>();
    let desired_mode = detect_mode(&session.dictation_hotkey(), flags);
    if desired_mode != state.current_mode {
        transition_mode(&state.app, state.current_mode, desired_mode);
        state.current_mode = desired_mode;
    }

    event
}

fn detect_mode(dictation: &str, flags: CGEventFlags) -> ActiveMode {
    let dictation_hotkey = match parse_hotkey(dictation, false) {
        Ok(hotkey) => hotkey,
        Err(_) => return ActiveMode::Idle,
    };
    let command_hotkey = dictation_hotkey.command_variant();

    if hotkey_matches(&command_hotkey, flags) {
        ActiveMode::Command
    } else if hotkey_matches(&dictation_hotkey, flags) {
        ActiveMode::Dictation
    } else {
        ActiveMode::Idle
    }
}

fn hotkey_matches(hotkey: &ModifierHotkey, flags: CGEventFlags) -> bool {
    (!hotkey.ctrl || flags & K_CG_EVENT_FLAG_MASK_CONTROL != 0)
        && (!hotkey.shift || flags & K_CG_EVENT_FLAG_MASK_SHIFT != 0)
        && (!hotkey.win || flags & K_CG_EVENT_FLAG_MASK_COMMAND != 0)
        && (!hotkey.alt || flags & K_CG_EVENT_FLAG_MASK_ALTERNATE != 0)
}

struct CfString {
    value: CFStringRef,
}

impl CfString {
    fn new(value: &'static str) -> Option<Self> {
        let c_value = CString::new(value).ok()?;
        let cf_value = unsafe {
            CFStringCreateWithCString(ptr::null(), c_value.as_ptr(), K_CF_STRING_ENCODING_UTF8)
        };
        (!cf_value.is_null()).then_some(Self { value: cf_value })
    }

    fn as_ptr(&self) -> CFStringRef {
        self.value
    }
}

impl Drop for CfString {
    fn drop(&mut self) {
        unsafe { CFRelease(self.value as CFTypeRef) };
    }
}
