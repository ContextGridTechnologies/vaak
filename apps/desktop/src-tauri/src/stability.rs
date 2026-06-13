use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, Runtime};

pub const VOICE_CAPSULE_LABEL: &str = "voice-capsule";
pub const MAIN_WINDOW_LABEL: &str = "main";
const STARTUP_FIELD_MAX_CHARS: usize = 240;
const STARTUP_DIAGNOSTICS_STDERR_ENV: &str = "VAAK_STARTUP_DIAGNOSTICS_STDERR";
const HEARTBEAT_INFO_LOG_EVERY: u64 = 12;
const WATCHDOG_INTERVAL: Duration = Duration::from_secs(10);
const STALE_HEARTBEAT_AFTER: Duration = Duration::from_secs(30);
const VOICE_CAPSULE_RECOVERY_TIMEOUT: Duration = Duration::from_secs(20);
const VOICE_CAPSULE_RECOVERY_POLL_INTERVAL: Duration = Duration::from_millis(250);

#[derive(Debug)]
struct RendererHealthSnapshot {
    main_heartbeat_count: u64,
    voice_capsule_heartbeat_count: u64,
    voice_capsule_last_seen: Instant,
    voice_capsule_recovery_in_progress: bool,
    voice_capsule_renderer_instance_id: Option<String>,
}

pub struct RendererHealth {
    inner: Mutex<RendererHealthSnapshot>,
}

#[derive(Debug)]
struct VoiceCapsuleReadinessSnapshot {
    run_id: String,
    attempt_id: String,
    nonce: String,
    issued_at: Instant,
    expected_renderer_instance_id: Option<String>,
    heartbeat_renderer_instance_id: Option<String>,
    accepted_at: Option<Instant>,
    accepted_attempt_id: Option<String>,
    accepted_renderer_instance_id: Option<String>,
    session_enabled: Option<bool>,
    recovery_state: VoiceCapsuleRecoveryState,
}

#[derive(Debug)]
enum VoiceCapsuleRecoveryState {
    Idle,
    Recovering {
        attempt_id: String,
        _reason: String,
        deadline: Instant,
        previous_renderer_instance_id: Option<String>,
    },
    DisabledByUser,
    ShuttingDown,
    Failed {
        attempt_id: String,
        reason: String,
    },
}

pub struct VoiceCapsuleReadiness {
    inner: Mutex<VoiceCapsuleReadinessSnapshot>,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceCapsuleReadyChallenge {
    pub run_id: String,
    pub attempt_id: String,
    pub nonce: String,
}

#[derive(Debug, Eq, PartialEq)]
pub struct VoiceCapsuleReadyInput<'a> {
    pub caller_label: &'a str,
    pub run_id: &'a str,
    pub attempt_id: &'a str,
    pub nonce: &'a str,
    pub renderer_instance_id: &'a str,
    pub session_enabled: bool,
}

#[derive(Debug, Eq, PartialEq)]
pub enum VoiceCapsuleReadyAck {
    Accepted { detail: String },
    Rejected { reason: &'static str },
}

#[derive(Debug, Eq, PartialEq)]
pub enum RendererHeartbeatLog {
    Info {
        count: u64,
        renderer_instance_id: Option<String>,
    },
    Skip,
}

impl RendererHeartbeatLog {
    pub fn detail(&self) -> Option<String> {
        match self {
            Self::Info {
                count,
                renderer_instance_id,
            } => {
                let mut detail = format!("count={count}");
                if let Some(renderer_instance_id) = renderer_instance_id {
                    detail.push_str(" rendererInstanceId=");
                    detail.push_str(renderer_instance_id);
                }
                Some(detail)
            }
            Self::Skip => None,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VoiceCapsuleRecoveryAttempt {
    pub attempt_id: String,
    pub previous_renderer_instance_id: Option<String>,
    pub forced_reload: bool,
}

impl VoiceCapsuleRecoveryAttempt {
    pub(crate) fn detail(&self, reason: &str) -> String {
        let previous_renderer = self
            .previous_renderer_instance_id
            .as_deref()
            .unwrap_or("none");
        format!(
            "reason={reason} attemptId={} previousRendererInstanceId={previous_renderer} forcedReload={}",
            self.attempt_id,
            if self.forced_reload { "true" } else { "false" }
        )
    }
}

#[derive(Debug, Eq, PartialEq)]
pub enum VoiceCapsuleRecoveryOutcome {
    Pending,
    Completed,
    Failed { reason: &'static str },
    Superseded,
}

#[cfg(test)]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VoiceCapsuleAttemptSnapshot {
    pub run_id: String,
    pub attempt_id: String,
    pub expected_renderer_instance_id: Option<String>,
    pub heartbeat_renderer_instance_id: Option<String>,
    pub accepted_attempt_id: Option<String>,
    pub accepted_renderer_instance_id: Option<String>,
    pub current_attempt_has_ack: bool,
}

#[derive(Clone)]
pub struct StartupDiagnostics {
    run_id: String,
    mirror_to_stderr: bool,
}

impl Default for RendererHealth {
    fn default() -> Self {
        Self {
            inner: Mutex::new(RendererHealthSnapshot {
                main_heartbeat_count: 0,
                voice_capsule_heartbeat_count: 0,
                voice_capsule_last_seen: Instant::now(),
                voice_capsule_recovery_in_progress: false,
                voice_capsule_renderer_instance_id: None,
            }),
        }
    }
}

impl VoiceCapsuleReadiness {
    pub fn new(run_id: &str) -> Self {
        Self {
            inner: Mutex::new(VoiceCapsuleReadinessSnapshot {
                run_id: run_id.to_string(),
                attempt_id: uuid::Uuid::new_v4().to_string(),
                nonce: uuid::Uuid::new_v4().to_string(),
                issued_at: Instant::now(),
                expected_renderer_instance_id: None,
                heartbeat_renderer_instance_id: None,
                accepted_at: None,
                accepted_attempt_id: None,
                accepted_renderer_instance_id: None,
                session_enabled: None,
                recovery_state: VoiceCapsuleRecoveryState::Idle,
            }),
        }
    }

    pub fn challenge(
        &self,
        renderer_instance_id: &str,
    ) -> Result<VoiceCapsuleReadyChallenge, &'static str> {
        let renderer_instance_id = renderer_instance_id.trim();
        if renderer_instance_id.is_empty() {
            return Err("missing_renderer_instance_id");
        }

        let Ok(mut snapshot) = self.inner.lock() else {
            return Err("state_unavailable");
        };

        snapshot.expected_renderer_instance_id = Some(renderer_instance_id.to_string());
        Ok(VoiceCapsuleReadyChallenge {
            run_id: snapshot.run_id.clone(),
            attempt_id: snapshot.attempt_id.clone(),
            nonce: snapshot.nonce.clone(),
        })
    }

    pub fn begin_recovery_attempt(
        &self,
        reason: &str,
        previous_renderer_instance_id: Option<String>,
    ) -> VoiceCapsuleRecoveryAttempt {
        let attempt_id = uuid::Uuid::new_v4().to_string();
        let nonce = uuid::Uuid::new_v4().to_string();
        let deadline = Instant::now() + VOICE_CAPSULE_RECOVERY_TIMEOUT;

        let Ok(mut snapshot) = self.inner.lock() else {
            return VoiceCapsuleRecoveryAttempt {
                attempt_id,
                previous_renderer_instance_id,
                forced_reload: true,
            };
        };

        snapshot.attempt_id = attempt_id.clone();
        snapshot.nonce = nonce;
        snapshot.issued_at = Instant::now();
        snapshot.expected_renderer_instance_id = None;
        snapshot.heartbeat_renderer_instance_id = None;
        snapshot.accepted_at = None;
        snapshot.accepted_attempt_id = None;
        snapshot.accepted_renderer_instance_id = None;
        snapshot.session_enabled = None;
        snapshot.recovery_state = VoiceCapsuleRecoveryState::Recovering {
            attempt_id: attempt_id.clone(),
            _reason: reason.to_string(),
            deadline,
            previous_renderer_instance_id: previous_renderer_instance_id.clone(),
        };

        VoiceCapsuleRecoveryAttempt {
            attempt_id,
            previous_renderer_instance_id,
            forced_reload: true,
        }
    }

    pub fn record_voice_capsule_heartbeat(&self, renderer_instance_id: &str) {
        let renderer_instance_id = renderer_instance_id.trim();
        if renderer_instance_id.is_empty() {
            return;
        }

        let Ok(mut snapshot) = self.inner.lock() else {
            return;
        };
        snapshot.heartbeat_renderer_instance_id = Some(renderer_instance_id.to_string());
    }

    #[cfg(test)]
    pub fn attempt_snapshot(&self) -> Result<VoiceCapsuleAttemptSnapshot, &'static str> {
        let Ok(snapshot) = self.inner.lock() else {
            return Err("state_unavailable");
        };

        let current_attempt_has_ack = snapshot.accepted_attempt_id.as_deref()
            == Some(snapshot.attempt_id.as_str())
            && snapshot.accepted_renderer_instance_id.is_some();

        Ok(VoiceCapsuleAttemptSnapshot {
            run_id: snapshot.run_id.clone(),
            attempt_id: snapshot.attempt_id.clone(),
            expected_renderer_instance_id: snapshot.expected_renderer_instance_id.clone(),
            heartbeat_renderer_instance_id: snapshot.heartbeat_renderer_instance_id.clone(),
            accepted_attempt_id: snapshot.accepted_attempt_id.clone(),
            accepted_renderer_instance_id: snapshot.accepted_renderer_instance_id.clone(),
            current_attempt_has_ack,
        })
    }

    pub fn recovery_outcome(
        &self,
        attempt_id: &str,
        require_new_renderer_instance: bool,
    ) -> VoiceCapsuleRecoveryOutcome {
        let Ok(snapshot) = self.inner.lock() else {
            return VoiceCapsuleRecoveryOutcome::Failed {
                reason: "state_unavailable",
            };
        };

        if attempt_id != snapshot.attempt_id {
            return VoiceCapsuleRecoveryOutcome::Superseded;
        }

        let previous_renderer_instance_id = match &snapshot.recovery_state {
            VoiceCapsuleRecoveryState::Recovering {
                attempt_id: recovering_attempt_id,
                deadline,
                previous_renderer_instance_id,
                ..
            } if recovering_attempt_id == attempt_id => {
                if Instant::now() > *deadline {
                    return VoiceCapsuleRecoveryOutcome::Failed { reason: "timeout" };
                }
                previous_renderer_instance_id.as_deref()
            }
            VoiceCapsuleRecoveryState::Failed {
                attempt_id: failed_attempt_id,
                reason,
            } if failed_attempt_id == attempt_id => {
                return VoiceCapsuleRecoveryOutcome::Failed {
                    reason: failure_reason(reason),
                };
            }
            VoiceCapsuleRecoveryState::DisabledByUser => {
                return VoiceCapsuleRecoveryOutcome::Failed {
                    reason: "disabled_by_user",
                };
            }
            VoiceCapsuleRecoveryState::ShuttingDown => {
                return VoiceCapsuleRecoveryOutcome::Failed {
                    reason: "shutting_down",
                };
            }
            VoiceCapsuleRecoveryState::Idle => return VoiceCapsuleRecoveryOutcome::Pending,
            _ => return VoiceCapsuleRecoveryOutcome::Superseded,
        };

        let Some(heartbeat_renderer_instance_id) =
            snapshot.heartbeat_renderer_instance_id.as_deref()
        else {
            return VoiceCapsuleRecoveryOutcome::Pending;
        };
        let Some(accepted_renderer_instance_id) = snapshot.accepted_renderer_instance_id.as_deref()
        else {
            return VoiceCapsuleRecoveryOutcome::Pending;
        };
        if snapshot.accepted_attempt_id.as_deref() != Some(attempt_id) {
            return VoiceCapsuleRecoveryOutcome::Pending;
        }
        if accepted_renderer_instance_id != heartbeat_renderer_instance_id {
            return VoiceCapsuleRecoveryOutcome::Pending;
        }
        if snapshot.session_enabled != Some(true) {
            return VoiceCapsuleRecoveryOutcome::Pending;
        }
        if require_new_renderer_instance
            && previous_renderer_instance_id == Some(accepted_renderer_instance_id)
        {
            return VoiceCapsuleRecoveryOutcome::Failed {
                reason: "renderer_instance_not_reloaded",
            };
        }

        VoiceCapsuleRecoveryOutcome::Completed
    }

    pub fn complete_recovery_attempt(&self, attempt_id: &str) -> bool {
        let Ok(mut snapshot) = self.inner.lock() else {
            return false;
        };

        if snapshot.attempt_id != attempt_id {
            return false;
        }
        snapshot.recovery_state = VoiceCapsuleRecoveryState::Idle;
        true
    }

    pub fn fail_recovery_attempt(&self, attempt_id: &str, reason: &str) -> bool {
        let Ok(mut snapshot) = self.inner.lock() else {
            return false;
        };

        if snapshot.attempt_id != attempt_id {
            return false;
        }
        snapshot.recovery_state = VoiceCapsuleRecoveryState::Failed {
            attempt_id: attempt_id.to_string(),
            reason: reason.to_string(),
        };
        true
    }

    pub fn disable_by_user(&self) {
        let Ok(mut snapshot) = self.inner.lock() else {
            return;
        };
        snapshot.recovery_state = VoiceCapsuleRecoveryState::DisabledByUser;
    }

    pub fn enable_by_user(&self) {
        let Ok(mut snapshot) = self.inner.lock() else {
            return;
        };
        snapshot.recovery_state = VoiceCapsuleRecoveryState::Idle;
    }

    pub fn mark_shutting_down(&self) {
        let Ok(mut snapshot) = self.inner.lock() else {
            return;
        };
        snapshot.recovery_state = VoiceCapsuleRecoveryState::ShuttingDown;
    }

    pub fn is_disabled_by_user(&self) -> bool {
        self.inner
            .lock()
            .map(|snapshot| {
                matches!(
                    snapshot.recovery_state,
                    VoiceCapsuleRecoveryState::DisabledByUser
                )
            })
            .unwrap_or(false)
    }

    pub fn record_ready(&self, input: VoiceCapsuleReadyInput<'_>) -> VoiceCapsuleReadyAck {
        if input.caller_label != VOICE_CAPSULE_LABEL {
            return VoiceCapsuleReadyAck::Rejected {
                reason: "wrong_window",
            };
        }

        let Ok(mut snapshot) = self.inner.lock() else {
            return VoiceCapsuleReadyAck::Rejected {
                reason: "state_unavailable",
            };
        };

        if input.run_id != snapshot.run_id {
            return VoiceCapsuleReadyAck::Rejected {
                reason: "stale_run",
            };
        }

        if input.attempt_id != snapshot.attempt_id {
            return VoiceCapsuleReadyAck::Rejected {
                reason: "stale_attempt",
            };
        }

        if input.nonce != snapshot.nonce {
            return VoiceCapsuleReadyAck::Rejected {
                reason: "bad_nonce",
            };
        }

        if snapshot.expected_renderer_instance_id.as_deref() != Some(input.renderer_instance_id) {
            return VoiceCapsuleReadyAck::Rejected {
                reason: "renderer_instance_mismatch",
            };
        }

        snapshot.accepted_at = Some(Instant::now());
        snapshot.accepted_attempt_id = Some(input.attempt_id.to_string());
        snapshot.accepted_renderer_instance_id = Some(input.renderer_instance_id.to_string());
        snapshot.session_enabled = Some(input.session_enabled);

        VoiceCapsuleReadyAck::Accepted {
            detail: format!(
                "sessionEnabled={} attemptId={} rendererInstanceId={}",
                if input.session_enabled {
                    "true"
                } else {
                    "false"
                },
                input.attempt_id,
                input.renderer_instance_id
            ),
        }
    }
}

fn failure_reason(reason: &str) -> &'static str {
    match reason {
        "timeout" => "timeout",
        "renderer_instance_not_reloaded" => "renderer_instance_not_reloaded",
        "disabled_by_user" => "disabled_by_user",
        "shutting_down" => "shutting_down",
        "state_unavailable" => "state_unavailable",
        _ => "failed",
    }
}

impl StartupDiagnostics {
    pub fn new() -> Self {
        Self::new_with_stderr_mirroring(startup_diagnostics_stderr_enabled())
    }

    fn new_with_stderr_mirroring(mirror_to_stderr: bool) -> Self {
        Self {
            run_id: uuid::Uuid::new_v4().to_string(),
            mirror_to_stderr,
        }
    }

    pub fn run_id(&self) -> &str {
        &self.run_id
    }

    pub fn record_backend_checkpoint(&self, checkpoint: &str, detail: Option<&str>) {
        self.emit_checkpoint(format_startup_checkpoint(
            &self.run_id,
            "backend",
            None,
            checkpoint,
            detail,
        ));
    }

    pub fn record_renderer_checkpoint(
        &self,
        window_label: &str,
        checkpoint: &str,
        detail: Option<&str>,
    ) {
        self.emit_checkpoint(format_startup_checkpoint(
            &self.run_id,
            "renderer",
            Some(window_label),
            checkpoint,
            detail,
        ));
    }

    fn emit_checkpoint(&self, line: String) {
        log::info!("{line}");
        if self.mirror_to_stderr {
            eprintln!("{line}");
        }
    }
}

impl Default for StartupDiagnostics {
    fn default() -> Self {
        Self::new()
    }
}

pub fn format_startup_checkpoint(
    run_id: &str,
    component: &str,
    window_label: Option<&str>,
    checkpoint: &str,
    detail: Option<&str>,
) -> String {
    let mut fields = vec![
        "startup_checkpoint".to_string(),
        format!("run_id={}", normalize_startup_field(run_id)),
        format!("component={}", normalize_startup_field(component)),
    ];

    if let Some(window_label) = window_label {
        fields.push(format!("window={}", normalize_startup_field(window_label)));
    }

    fields.push(format!(
        "checkpoint={}",
        normalize_startup_field(checkpoint)
    ));

    if let Some(detail) = detail {
        fields.push(format!(
            "detail={}",
            normalize_startup_field(&sanitize_startup_detail(detail))
        ));
    }

    fields.join(" ")
}

fn sanitize_startup_detail(value: &str) -> String {
    if contains_sensitive_diagnostic_marker(value) {
        return "redacted".to_string();
    }

    let sanitized = value
        .split_whitespace()
        .map(redact_path_token)
        .collect::<Vec<_>>()
        .join(" ");

    if sanitized.trim().is_empty() {
        "empty".to_string()
    } else {
        sanitized
    }
}

fn contains_sensitive_diagnostic_marker(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    [
        "apikey",
        "api_key",
        "api-key",
        "authorization",
        "bearer ",
        "token=",
        "secret",
        "password",
        "credential",
        "transcript",
        "prompt",
        "documenttext",
        "document_text",
        "windowtitle",
        "window_title",
        "microphonelabel",
        "microphone_label",
        "deviceid",
        "device_id",
        "rawdevice",
        "providerpayload",
        "provider_payload",
        "payload=",
        "audio=",
        "sk-",
    ]
    .iter()
    .any(|marker| lower.contains(marker))
}

fn redact_path_token(token: &str) -> String {
    if !looks_like_local_path(token) {
        return token.to_string();
    }

    if let Some((key, _value)) = token.split_once('=') {
        if key.trim().is_empty() {
            return "redacted_path".to_string();
        }
        return format!("{key}=redacted_path");
    }

    "redacted_path".to_string()
}

fn looks_like_local_path(token: &str) -> bool {
    let lower = token.to_ascii_lowercase();
    lower.contains(":\\")
        || lower.contains(":/")
        || lower.contains("\\users\\")
        || lower.contains("/users/")
        || lower.contains("/home/")
        || lower.starts_with("\\\\")
}

fn normalize_startup_field(value: &str) -> String {
    let normalized: String = value
        .chars()
        .take(STARTUP_FIELD_MAX_CHARS)
        .map(|character| {
            if character.is_control() || character.is_whitespace() {
                '_'
            } else {
                character
            }
        })
        .collect();

    if normalized.is_empty() {
        "empty".to_string()
    } else {
        normalized
    }
}

fn startup_diagnostics_stderr_enabled() -> bool {
    startup_diagnostics_stderr_enabled_from_value(
        std::env::var(STARTUP_DIAGNOSTICS_STDERR_ENV)
            .ok()
            .as_deref(),
    )
}

fn startup_diagnostics_stderr_enabled_from_value(value: Option<&str>) -> bool {
    matches!(value, Some("1" | "true" | "TRUE" | "True"))
}

impl RendererHealth {
    pub fn record_heartbeat(
        &self,
        window_label: &str,
        renderer_instance_id: Option<&str>,
    ) -> RendererHeartbeatLog {
        let Ok(mut snapshot) = self.inner.lock() else {
            return RendererHeartbeatLog::Skip;
        };

        match window_label {
            MAIN_WINDOW_LABEL => {
                snapshot.main_heartbeat_count = snapshot.main_heartbeat_count.saturating_add(1);
                heartbeat_log_decision(snapshot.main_heartbeat_count, renderer_instance_id, false)
            }
            VOICE_CAPSULE_LABEL => {
                let renderer_instance_changed = renderer_instance_id.is_some()
                    && renderer_instance_id
                        != snapshot.voice_capsule_renderer_instance_id.as_deref();
                snapshot.voice_capsule_last_seen = Instant::now();
                snapshot.voice_capsule_renderer_instance_id =
                    renderer_instance_id.map(ToString::to_string);
                snapshot.voice_capsule_heartbeat_count =
                    snapshot.voice_capsule_heartbeat_count.saturating_add(1);
                heartbeat_log_decision(
                    snapshot.voice_capsule_heartbeat_count,
                    renderer_instance_id,
                    renderer_instance_changed,
                )
            }
            _ => RendererHeartbeatLog::Skip,
        }
    }

    pub fn latest_voice_capsule_renderer_instance_id(&self) -> Option<String> {
        self.inner
            .lock()
            .ok()
            .and_then(|snapshot| snapshot.voice_capsule_renderer_instance_id.clone())
    }

    #[cfg(test)]
    pub fn voice_capsule_recovery_in_progress(&self) -> bool {
        self.inner
            .lock()
            .map(|snapshot| snapshot.voice_capsule_recovery_in_progress)
            .unwrap_or(false)
    }

    pub fn finish_voice_capsule_recovery(&self) {
        let Ok(mut snapshot) = self.inner.lock() else {
            return;
        };
        snapshot.voice_capsule_recovery_in_progress = false;
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

fn heartbeat_log_decision(
    count: u64,
    renderer_instance_id: Option<&str>,
    force: bool,
) -> RendererHeartbeatLog {
    if force || count == 1 || count % HEARTBEAT_INFO_LOG_EVERY == 0 {
        RendererHeartbeatLog::Info {
            count,
            renderer_instance_id: renderer_instance_id.map(ToString::to_string),
        }
    } else {
        RendererHeartbeatLog::Skip
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
        let Some(readiness) = app.try_state::<VoiceCapsuleReadiness>() else {
            continue;
        };
        if readiness.is_disabled_by_user() {
            continue;
        }

        if !health.stale_voice_capsule(Instant::now()) {
            continue;
        }

        let previous_renderer_instance_id = health.latest_voice_capsule_renderer_instance_id();
        let attempt = readiness
            .begin_recovery_attempt("stale_heartbeat", previous_renderer_instance_id.clone());
        let start_detail = attempt.detail("stale_heartbeat");
        if let Some(diagnostics) = app.try_state::<StartupDiagnostics>() {
            diagnostics
                .record_backend_checkpoint("voice_capsule_recovery_started", Some(&start_detail));
        }
        recover_voice_capsule_window(&app);
        let outcome = wait_for_voice_capsule_recovery(
            readiness.inner(),
            &attempt.attempt_id,
            attempt.forced_reload,
        );
        match outcome {
            VoiceCapsuleRecoveryOutcome::Completed => {
                readiness.complete_recovery_attempt(&attempt.attempt_id);
                if let Some(diagnostics) = app.try_state::<StartupDiagnostics>() {
                    diagnostics.record_backend_checkpoint(
                        "voice_capsule_recovery_completed",
                        Some(&format!("attemptId={}", attempt.attempt_id)),
                    );
                }
            }
            VoiceCapsuleRecoveryOutcome::Pending => {
                readiness.fail_recovery_attempt(&attempt.attempt_id, "timeout");
                if let Some(diagnostics) = app.try_state::<StartupDiagnostics>() {
                    diagnostics.record_backend_checkpoint(
                        "voice_capsule_recovery_failed",
                        Some(&format!("attemptId={} reason=timeout", attempt.attempt_id)),
                    );
                }
            }
            VoiceCapsuleRecoveryOutcome::Failed { reason } => {
                readiness.fail_recovery_attempt(&attempt.attempt_id, reason);
                if let Some(diagnostics) = app.try_state::<StartupDiagnostics>() {
                    diagnostics.record_backend_checkpoint(
                        "voice_capsule_recovery_failed",
                        Some(&format!("attemptId={} reason={reason}", attempt.attempt_id)),
                    );
                }
            }
            VoiceCapsuleRecoveryOutcome::Superseded => {
                if let Some(diagnostics) = app.try_state::<StartupDiagnostics>() {
                    diagnostics.record_backend_checkpoint(
                        "voice_capsule_recovery_superseded",
                        Some(&format!("attemptId={}", attempt.attempt_id)),
                    );
                }
            }
        }
        health.finish_voice_capsule_recovery();
    });
}

fn wait_for_voice_capsule_recovery(
    readiness: &VoiceCapsuleReadiness,
    attempt_id: &str,
    forced_reload: bool,
) -> VoiceCapsuleRecoveryOutcome {
    let started = Instant::now();
    loop {
        let outcome = readiness.recovery_outcome(attempt_id, forced_reload);
        if outcome != VoiceCapsuleRecoveryOutcome::Pending {
            return outcome;
        }
        if started.elapsed() >= VOICE_CAPSULE_RECOVERY_TIMEOUT {
            return VoiceCapsuleRecoveryOutcome::Pending;
        }
        thread::sleep(VOICE_CAPSULE_RECOVERY_POLL_INTERVAL);
    }
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

        health.record_heartbeat(VOICE_CAPSULE_LABEL, Some("renderer-1"));

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

        health.record_heartbeat(VOICE_CAPSULE_LABEL, Some("renderer-1"));
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

        health.record_heartbeat("main", Some("renderer-main"));

        assert!(health.stale_voice_capsule(Instant::now()));
    }

    #[test]
    fn main_window_heartbeat_logging_is_throttled_after_first_seen() {
        let health = RendererHealth::default();

        assert_eq!(
            health.record_heartbeat("main", Some("renderer-main")),
            RendererHeartbeatLog::Info {
                count: 1,
                renderer_instance_id: Some("renderer-main".to_string()),
            }
        );
        assert_eq!(
            health.record_heartbeat("main", Some("renderer-main")),
            RendererHeartbeatLog::Skip
        );
    }

    #[test]
    fn startup_checkpoint_line_includes_run_id_component_window_and_detail() {
        let line = format_startup_checkpoint(
            "run-1",
            "renderer",
            Some("main"),
            "onboarding_state_loaded",
            Some("completed"),
        );

        assert_eq!(
            line,
            "startup_checkpoint run_id=run-1 component=renderer window=main checkpoint=onboarding_state_loaded detail=completed"
        );
    }

    #[test]
    fn startup_checkpoint_line_normalizes_control_characters() {
        let line = format_startup_checkpoint(
            "run-1\nbad",
            "renderer",
            Some("main\rbad"),
            "checkpoint\tbad",
            Some("line\nbreak"),
        );

        assert_eq!(
            line,
            "startup_checkpoint run_id=run-1_bad component=renderer window=main_bad checkpoint=checkpoint_bad detail=line_break"
        );
    }

    #[test]
    fn startup_checkpoint_detail_redacts_sensitive_values() {
        let line = format_startup_checkpoint(
            "run-1",
            "renderer",
            Some("voice-capsule"),
            "renderer_error_reported",
            Some(
                "apiKey=sk-test transcript=private microphoneLabel=Studio deviceId=raw windowTitle=Draft",
            ),
        );

        assert_eq!(
            line,
            "startup_checkpoint run_id=run-1 component=renderer window=voice-capsule checkpoint=renderer_error_reported detail=redacted"
        );
        assert!(!line.contains("sk-test"));
        assert!(!line.contains("private"));
        assert!(!line.contains("Studio"));
        assert!(!line.contains("Draft"));
    }

    #[test]
    fn startup_checkpoint_detail_redacts_local_paths_but_keeps_category() {
        let line = format_startup_checkpoint(
            "run-1",
            "backend",
            None,
            "startup_onboarding_failed",
            Some(
                "settings_error=C:\\Users\\nikhi\\AppData\\Roaming\\ai.vaak.desktop\\settings.json",
            ),
        );

        assert_eq!(
            line,
            "startup_checkpoint run_id=run-1 component=backend checkpoint=startup_onboarding_failed detail=settings_error=redacted_path"
        );
        assert!(!line.contains("nikhi"));
        assert!(!line.contains("settings.json"));
    }

    #[test]
    fn startup_diagnostics_stderr_mirror_is_opt_in() {
        assert!(startup_diagnostics_stderr_enabled_from_value(Some("1")));
        assert!(startup_diagnostics_stderr_enabled_from_value(Some("true")));
        assert!(!startup_diagnostics_stderr_enabled_from_value(None));
        assert!(!startup_diagnostics_stderr_enabled_from_value(Some("0")));
    }

    #[test]
    fn voice_capsule_ready_ack_accepts_current_voice_capsule_challenge() {
        let readiness = VoiceCapsuleReadiness::new("run-1");
        let challenge = readiness
            .challenge("renderer-1")
            .expect("challenge should be available");

        assert_eq!(
            readiness.record_ready(VoiceCapsuleReadyInput {
                caller_label: VOICE_CAPSULE_LABEL,
                run_id: &challenge.run_id,
                attempt_id: &challenge.attempt_id,
                nonce: &challenge.nonce,
                renderer_instance_id: "renderer-1",
                session_enabled: true,
            }),
            VoiceCapsuleReadyAck::Accepted {
                detail: format!(
                    "sessionEnabled=true attemptId={} rendererInstanceId=renderer-1",
                    challenge.attempt_id
                ),
            }
        );
    }

    #[test]
    fn voice_capsule_attempt_snapshot_exposes_current_ack_evidence() {
        let readiness = VoiceCapsuleReadiness::new("run-1");
        let challenge = readiness
            .challenge("renderer-1")
            .expect("challenge should be available");

        readiness.record_voice_capsule_heartbeat("renderer-1");
        let _ = readiness.record_ready(VoiceCapsuleReadyInput {
            caller_label: VOICE_CAPSULE_LABEL,
            run_id: &challenge.run_id,
            attempt_id: &challenge.attempt_id,
            nonce: &challenge.nonce,
            renderer_instance_id: "renderer-1",
            session_enabled: true,
        });

        assert_eq!(
            readiness
                .attempt_snapshot()
                .expect("snapshot should be available"),
            VoiceCapsuleAttemptSnapshot {
                run_id: "run-1".to_string(),
                attempt_id: challenge.attempt_id.clone(),
                expected_renderer_instance_id: Some("renderer-1".to_string()),
                heartbeat_renderer_instance_id: Some("renderer-1".to_string()),
                accepted_attempt_id: Some(challenge.attempt_id),
                accepted_renderer_instance_id: Some("renderer-1".to_string()),
                current_attempt_has_ack: true,
            }
        );
    }

    #[test]
    fn voice_capsule_ready_ack_rejects_wrong_window() {
        let readiness = VoiceCapsuleReadiness::new("run-1");
        let challenge = readiness
            .challenge("renderer-1")
            .expect("challenge should be available");

        assert_eq!(
            readiness.record_ready(VoiceCapsuleReadyInput {
                caller_label: MAIN_WINDOW_LABEL,
                run_id: &challenge.run_id,
                attempt_id: &challenge.attempt_id,
                nonce: &challenge.nonce,
                renderer_instance_id: "renderer-1",
                session_enabled: true,
            }),
            VoiceCapsuleReadyAck::Rejected {
                reason: "wrong_window",
            }
        );
    }

    #[test]
    fn voice_capsule_ready_ack_rejects_stale_run_and_bad_nonce() {
        let readiness = VoiceCapsuleReadiness::new("run-1");
        let challenge = readiness
            .challenge("renderer-1")
            .expect("challenge should be available");

        assert_eq!(
            readiness.record_ready(VoiceCapsuleReadyInput {
                caller_label: VOICE_CAPSULE_LABEL,
                run_id: "old-run",
                attempt_id: &challenge.attempt_id,
                nonce: &challenge.nonce,
                renderer_instance_id: "renderer-1",
                session_enabled: true,
            }),
            VoiceCapsuleReadyAck::Rejected {
                reason: "stale_run",
            }
        );
        assert_eq!(
            readiness.record_ready(VoiceCapsuleReadyInput {
                caller_label: VOICE_CAPSULE_LABEL,
                run_id: &challenge.run_id,
                attempt_id: &challenge.attempt_id,
                nonce: "bad-nonce",
                renderer_instance_id: "renderer-1",
                session_enabled: true,
            }),
            VoiceCapsuleReadyAck::Rejected {
                reason: "bad_nonce",
            }
        );
    }

    #[test]
    fn voice_capsule_ready_ack_rejects_stale_attempt_id() {
        let readiness = VoiceCapsuleReadiness::new("run-1");
        let old_challenge = readiness
            .challenge("renderer-1")
            .expect("challenge should be available");
        let new_attempt =
            readiness.begin_recovery_attempt("stale_heartbeat", Some("renderer-1".to_string()));

        assert_eq!(
            readiness.record_ready(VoiceCapsuleReadyInput {
                caller_label: VOICE_CAPSULE_LABEL,
                run_id: &old_challenge.run_id,
                attempt_id: &old_challenge.attempt_id,
                nonce: &old_challenge.nonce,
                renderer_instance_id: "renderer-1",
                session_enabled: true,
            }),
            VoiceCapsuleReadyAck::Rejected {
                reason: "stale_attempt",
            }
        );

        let current = readiness
            .challenge("renderer-2")
            .expect("challenge should be available");
        assert_eq!(current.attempt_id, new_attempt.attempt_id);
    }

    #[test]
    fn voice_capsule_ready_ack_rejects_mismatched_renderer_instance() {
        let readiness = VoiceCapsuleReadiness::new("run-1");
        let challenge = readiness
            .challenge("renderer-1")
            .expect("challenge should be available");

        assert_eq!(
            readiness.record_ready(VoiceCapsuleReadyInput {
                caller_label: VOICE_CAPSULE_LABEL,
                run_id: &challenge.run_id,
                attempt_id: &challenge.attempt_id,
                nonce: &challenge.nonce,
                renderer_instance_id: "renderer-2",
                session_enabled: true,
            }),
            VoiceCapsuleReadyAck::Rejected {
                reason: "renderer_instance_mismatch",
            }
        );
    }

    #[test]
    fn voice_capsule_recovery_requires_current_heartbeat_and_ack() {
        let readiness = VoiceCapsuleReadiness::new("run-1");
        readiness
            .challenge("renderer-1")
            .expect("challenge should be available");
        let attempt =
            readiness.begin_recovery_attempt("stale_heartbeat", Some("renderer-1".to_string()));

        assert_eq!(
            readiness.recovery_outcome(&attempt.attempt_id, true),
            VoiceCapsuleRecoveryOutcome::Pending
        );

        readiness.record_voice_capsule_heartbeat("renderer-2");
        assert_eq!(
            readiness.recovery_outcome(&attempt.attempt_id, true),
            VoiceCapsuleRecoveryOutcome::Pending
        );

        let challenge = readiness
            .challenge("renderer-2")
            .expect("challenge should be available");
        assert_eq!(
            readiness.record_ready(VoiceCapsuleReadyInput {
                caller_label: VOICE_CAPSULE_LABEL,
                run_id: &challenge.run_id,
                attempt_id: &challenge.attempt_id,
                nonce: &challenge.nonce,
                renderer_instance_id: "renderer-2",
                session_enabled: true,
            }),
            VoiceCapsuleReadyAck::Accepted {
                detail: format!(
                    "sessionEnabled=true attemptId={} rendererInstanceId=renderer-2",
                    challenge.attempt_id
                ),
            }
        );
        assert_eq!(
            readiness.recovery_outcome(&attempt.attempt_id, true),
            VoiceCapsuleRecoveryOutcome::Completed
        );
    }

    #[test]
    fn forced_reload_recovery_rejects_the_previous_renderer_instance() {
        let readiness = VoiceCapsuleReadiness::new("run-1");
        readiness
            .challenge("renderer-1")
            .expect("challenge should be available");
        let attempt =
            readiness.begin_recovery_attempt("stale_heartbeat", Some("renderer-1".to_string()));
        let challenge = readiness
            .challenge("renderer-1")
            .expect("challenge should be available");

        readiness.record_voice_capsule_heartbeat("renderer-1");
        let _ = readiness.record_ready(VoiceCapsuleReadyInput {
            caller_label: VOICE_CAPSULE_LABEL,
            run_id: &challenge.run_id,
            attempt_id: &challenge.attempt_id,
            nonce: &challenge.nonce,
            renderer_instance_id: "renderer-1",
            session_enabled: true,
        });

        assert_eq!(
            readiness.recovery_outcome(&attempt.attempt_id, true),
            VoiceCapsuleRecoveryOutcome::Failed {
                reason: "renderer_instance_not_reloaded",
            }
        );
    }

    #[test]
    fn voice_capsule_heartbeat_does_not_clear_recovery_in_progress() {
        let health = RendererHealth::default();
        {
            let mut snapshot = health.inner.lock().unwrap();
            snapshot.voice_capsule_last_seen =
                Instant::now() - STALE_HEARTBEAT_AFTER - Duration::from_secs(1);
        }

        assert!(health.stale_voice_capsule(Instant::now()));
        assert_eq!(
            health.record_heartbeat(VOICE_CAPSULE_LABEL, Some("renderer-1")),
            RendererHeartbeatLog::Info {
                count: 1,
                renderer_instance_id: Some("renderer-1".to_string()),
            }
        );
        assert!(!health.stale_voice_capsule(Instant::now()));
        assert!(health.voice_capsule_recovery_in_progress());
    }
}
