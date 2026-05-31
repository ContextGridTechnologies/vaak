use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, Runtime};

const VOICE_CAPSULE_LABEL: &str = "voice-capsule";
const WATCHDOG_INTERVAL: Duration = Duration::from_secs(10);
const STALE_HEARTBEAT_AFTER: Duration = Duration::from_secs(30);

#[derive(Debug)]
struct RendererHealthSnapshot {
    voice_capsule_last_seen: Instant,
    voice_capsule_recovery_in_progress: bool,
}

pub struct RendererHealth {
    inner: Mutex<RendererHealthSnapshot>,
}

impl Default for RendererHealth {
    fn default() -> Self {
        Self {
            inner: Mutex::new(RendererHealthSnapshot {
                voice_capsule_last_seen: Instant::now(),
                voice_capsule_recovery_in_progress: false,
            }),
        }
    }
}

impl RendererHealth {
    pub fn record_heartbeat(&self, window_label: &str) {
        if window_label != VOICE_CAPSULE_LABEL {
            return;
        }

        if let Ok(mut snapshot) = self.inner.lock() {
            snapshot.voice_capsule_last_seen = Instant::now();
            snapshot.voice_capsule_recovery_in_progress = false;
        }
    }

    fn stale_voice_capsule(&self, now: Instant) -> bool {
        let Ok(mut snapshot) = self.inner.lock() else {
            return false;
        };

        if snapshot.voice_capsule_recovery_in_progress {
            return false;
        }

        if now.duration_since(snapshot.voice_capsule_last_seen) < STALE_HEARTBEAT_AFTER {
            return false;
        }

        snapshot.voice_capsule_recovery_in_progress = true;
        true
    }
}

pub fn initialize_process_recovery() {
    #[cfg(windows)]
    {
        if let Err(err) = register_windows_application_restart() {
            log::warn!("failed to register Windows application restart: {err}");
        }
    }
}

pub fn initialize_panic_logging() {
    std::panic::set_hook(Box::new(|info| {
        let message = info.to_string();
        eprintln!("vaak backend panic: {message}");
        log::error!("backend_panic {message}");
    }));
}

#[cfg(windows)]
fn register_windows_application_restart() -> Result<(), String> {
    use windows_sys::Win32::System::Recovery::RegisterApplicationRestart;

    let result = unsafe { RegisterApplicationRestart(std::ptr::null(), 0) };
    if result < 0 {
        return Err(format!(
            "RegisterApplicationRestart failed: HRESULT {result:#x}"
        ));
    }

    Ok(())
}

pub fn start_renderer_watchdog<R: Runtime + 'static>(app: AppHandle<R>) {
    thread::spawn(move || loop {
        thread::sleep(WATCHDOG_INTERVAL);

        let Some(health) = app.try_state::<RendererHealth>() else {
            continue;
        };

        if !health.stale_voice_capsule(Instant::now()) {
            continue;
        }

        recover_voice_capsule_window(&app);
    });
}

fn recover_voice_capsule_window<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(VOICE_CAPSULE_LABEL) else {
        log::warn!("voice capsule heartbeat is stale but the window was not found");
        return;
    };

    log::warn!("voice capsule heartbeat is stale; reloading the voice capsule window");

    if let Err(err) = window.eval("window.location.reload()") {
        log::warn!("failed to reload stale voice capsule window: {err}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_voice_capsule_heartbeat_is_not_stale() {
        let health = RendererHealth::default();

        health.record_heartbeat(VOICE_CAPSULE_LABEL);

        assert!(!health.stale_voice_capsule(Instant::now()));
    }

    #[test]
    fn stale_voice_capsule_is_reported_once_until_next_heartbeat() {
        let health = RendererHealth::default();
        {
            let mut snapshot = health.inner.lock().unwrap();
            snapshot.voice_capsule_last_seen =
                Instant::now() - STALE_HEARTBEAT_AFTER - Duration::from_secs(1);
        }

        assert!(health.stale_voice_capsule(Instant::now()));
        assert!(!health.stale_voice_capsule(Instant::now()));

        health.record_heartbeat(VOICE_CAPSULE_LABEL);
        assert!(!health.stale_voice_capsule(Instant::now()));
    }

    #[test]
    fn main_window_heartbeat_does_not_affect_voice_capsule_health() {
        let health = RendererHealth::default();
        {
            let mut snapshot = health.inner.lock().unwrap();
            snapshot.voice_capsule_last_seen =
                Instant::now() - STALE_HEARTBEAT_AFTER - Duration::from_secs(1);
        }

        health.record_heartbeat("main");

        assert!(health.stale_voice_capsule(Instant::now()));
    }
}
