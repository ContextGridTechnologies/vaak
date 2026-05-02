use crate::platform::common::{FocusedFieldInfo, PlatformError};
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_OPERATION_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CandidateScore {
    pub active_caret: u8,
    pub writable_value: u8,
    pub editor_surface: u8,
    pub has_keyboard_focus: u8,
    pub framework_hint: u8,
    pub text_support: u8,
    pub keyboard_focusable: u8,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum InsertionStrategy {
    ClipboardPaste,
    SendInput,
    UiaValuePattern,
}

impl InsertionStrategy {
    pub(super) const fn as_method(self) -> &'static str {
        match self {
            Self::ClipboardPaste => "clipboard_paste",
            Self::SendInput => "send_input",
            Self::UiaValuePattern => "uia_valuepattern",
        }
    }
}

#[derive(Clone, Debug)]
pub(super) struct FocusCandidateDiagnostics {
    pub snapshot: FocusedFieldInfo,
    pub source: String,
    pub has_keyboard_focus: bool,
    pub is_keyboard_focusable: bool,
    pub is_enabled: bool,
    pub is_read_only: bool,
    pub supports_value_pattern: bool,
    pub supports_text_pattern: bool,
    pub supports_text_pattern2: bool,
    pub supports_text_edit_pattern: bool,
    pub has_active_caret: bool,
    pub selected_strategy: Option<InsertionStrategy>,
    pub accept_reason: Option<String>,
    pub reject_reason: Option<String>,
    pub score: Option<CandidateScore>,
}

impl FocusCandidateDiagnostics {
    pub(super) fn selected_strategy_method(&self) -> Option<&'static str> {
        self.selected_strategy.map(InsertionStrategy::as_method)
    }

    pub(super) fn from_snapshot(snapshot: FocusedFieldInfo) -> Self {
        Self {
            snapshot,
            source: "captured_target".to_string(),
            has_keyboard_focus: false,
            is_keyboard_focusable: false,
            is_enabled: true,
            is_read_only: false,
            supports_value_pattern: false,
            supports_text_pattern: false,
            supports_text_pattern2: false,
            supports_text_edit_pattern: false,
            has_active_caret: false,
            selected_strategy: None,
            accept_reason: None,
            reject_reason: Some("captured target snapshot".to_string()),
            score: None,
        }
    }

    pub(super) fn for_mismatch(stable_id: &str) -> Self {
        Self::from_snapshot(FocusedFieldInfo {
            window_title: String::new(),
            control_name: String::new(),
            control_type: String::new(),
            control_type_id: 0,
            automation_id: String::new(),
            framework_id: String::new(),
            class_name: String::new(),
            current_value: String::new(),
            native_window_handle: 0,
            stable_id: stable_id.to_string(),
        })
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LogPayload {
    pub event: String,
    pub operation_id: String,
    pub window_title: String,
    pub stable_id: String,
    pub control_name: String,
    pub control_type: String,
    pub control_type_id: i32,
    pub automation_id: String,
    pub framework_id: String,
    pub class_name: String,
    pub supports_value_pattern: bool,
    pub supports_text_pattern: bool,
    pub supports_text_pattern2: bool,
    pub supports_text_edit_pattern: bool,
    pub has_active_caret: bool,
    pub has_keyboard_focus: bool,
    pub is_keyboard_focusable: bool,
    pub is_read_only: bool,
    pub chosen_strategy: Option<String>,
    pub reason: Option<String>,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub captured_stable_id: Option<String>,
    pub candidate_source: Option<String>,
}

impl LogPayload {
    pub(super) fn candidate_event(
        event: &str,
        operation_id: &str,
        candidate: &FocusCandidateDiagnostics,
        error: Option<&PlatformError>,
    ) -> Self {
        let reason = candidate
            .accept_reason
            .clone()
            .or_else(|| candidate.reject_reason.clone());

        Self {
            event: event.to_string(),
            operation_id: operation_id.to_string(),
            window_title: candidate.snapshot.window_title.clone(),
            stable_id: candidate.snapshot.stable_id.clone(),
            control_name: candidate.snapshot.control_name.clone(),
            control_type: candidate.snapshot.control_type.clone(),
            control_type_id: candidate.snapshot.control_type_id,
            automation_id: candidate.snapshot.automation_id.clone(),
            framework_id: candidate.snapshot.framework_id.clone(),
            class_name: candidate.snapshot.class_name.clone(),
            supports_value_pattern: candidate.supports_value_pattern,
            supports_text_pattern: candidate.supports_text_pattern,
            supports_text_pattern2: candidate.supports_text_pattern2,
            supports_text_edit_pattern: candidate.supports_text_edit_pattern,
            has_active_caret: candidate.has_active_caret,
            has_keyboard_focus: candidate.has_keyboard_focus,
            is_keyboard_focusable: candidate.is_keyboard_focusable,
            is_read_only: candidate.is_read_only,
            chosen_strategy: candidate.selected_strategy_method().map(ToOwned::to_owned),
            reason,
            error_code: error.map(|value| value.code.clone()),
            error_message: error.map(|value| value.message.clone()),
            captured_stable_id: None,
            candidate_source: Some(candidate.source.clone()),
        }
    }

    pub(super) fn target_changed(
        operation_id: &str,
        captured_stable_id: &str,
        captured: &FocusCandidateDiagnostics,
        current: &FocusCandidateDiagnostics,
    ) -> Self {
        let mut payload =
            Self::candidate_event("insert_target_changed", operation_id, current, None);
        payload.captured_stable_id = Some(captured_stable_id.to_string());
        payload.reason = Some(format!(
            "captured target {} no longer matches focused target {}",
            captured.snapshot.stable_id, current.snapshot.stable_id
        ));
        payload
    }
}

pub(super) fn next_operation_id(prefix: &str) -> String {
    let value = NEXT_OPERATION_ID.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}-{value}")
}

pub(super) fn score_candidate(candidate: &FocusCandidateDiagnostics) -> CandidateScore {
    CandidateScore {
        active_caret: u8::from(candidate.has_active_caret),
        writable_value: u8::from(has_writable_value_pattern(candidate)),
        editor_surface: u8::from(looks_like_editor_surface(candidate)),
        has_keyboard_focus: u8::from(candidate.has_keyboard_focus),
        framework_hint: u8::from(has_editor_framework_hint(candidate)),
        text_support: u8::from(candidate.supports_text_pattern)
            + u8::from(candidate.supports_text_pattern2)
            + u8::from(candidate.supports_text_edit_pattern),
        keyboard_focusable: u8::from(candidate.is_keyboard_focusable),
    }
}

#[cfg(test)]
pub(super) fn select_best_candidate(
    candidates: Vec<FocusCandidateDiagnostics>,
) -> Option<FocusCandidateDiagnostics> {
    let (evaluated, selected_index) = evaluate_candidates(candidates);
    selected_index.and_then(|index| evaluated.into_iter().nth(index))
}

pub(super) fn evaluate_candidates(
    candidates: Vec<FocusCandidateDiagnostics>,
) -> (Vec<FocusCandidateDiagnostics>, Option<usize>) {
    let mut evaluated = Vec::with_capacity(candidates.len());
    let mut best_index = None;
    let mut best_score = None;

    for mut candidate in candidates {
        candidate.selected_strategy = insertion_plan(&candidate).first().copied();
        candidate.score = Some(score_candidate(&candidate));
        if let Some(reason) = candidate_accept_reason(&candidate) {
            candidate.accept_reason = Some(reason);
            if best_score.is_none_or(|score| candidate.score > Some(score)) {
                best_score = candidate.score;
                best_index = Some(evaluated.len());
            }
        } else {
            candidate.reject_reason = Some(candidate_reject_reason(&candidate));
        }
        evaluated.push(candidate);
    }

    if let Some(index) = best_index {
        for (current_index, candidate) in evaluated.iter_mut().enumerate() {
            if current_index != index && candidate.reject_reason.is_none() {
                candidate.reject_reason =
                    Some("lower priority than selected candidate".to_string());
            }
        }
    }

    (evaluated, best_index)
}

pub(super) fn insertion_plan(candidate: &FocusCandidateDiagnostics) -> Vec<InsertionStrategy> {
    if looks_like_terminal_surface(candidate) {
        return vec![InsertionStrategy::SendInput];
    }

    if candidate.has_active_caret || looks_like_editor_surface(candidate) {
        return vec![
            InsertionStrategy::ClipboardPaste,
            InsertionStrategy::SendInput,
        ];
    }

    if has_writable_value_pattern(candidate) {
        return vec![InsertionStrategy::UiaValuePattern];
    }

    Vec::new()
}

pub(super) fn looks_like_editor_surface(candidate: &FocusCandidateDiagnostics) -> bool {
    if !candidate.has_keyboard_focus || !candidate.is_keyboard_focusable {
        return false;
    }

    let control_type_matches = matches!(
        candidate.snapshot.control_type.as_str(),
        "Edit" | "Document" | "Pane" | "Custom"
    );
    let has_text_contract = candidate.supports_text_pattern
        || candidate.supports_text_pattern2
        || candidate.supports_text_edit_pattern;

    control_type_matches && (has_text_contract || has_editor_framework_hint(candidate))
}

fn looks_like_terminal_surface(candidate: &FocusCandidateDiagnostics) -> bool {
    if !candidate.has_keyboard_focus || !candidate.is_keyboard_focusable {
        return false;
    }

    let control_type_matches = matches!(
        candidate.snapshot.control_type.as_str(),
        "Document" | "Pane" | "Custom" | "Text"
    );

    control_type_matches && has_terminal_hint(candidate)
}

fn has_writable_value_pattern(candidate: &FocusCandidateDiagnostics) -> bool {
    candidate.supports_value_pattern && candidate.is_enabled && !candidate.is_read_only
}

fn has_editor_framework_hint(candidate: &FocusCandidateDiagnostics) -> bool {
    has_any_hint(
        candidate,
        &[
            "chrome",
            "electron",
            "chromium",
            "renderwidget",
            "scintilla",
            "monaco",
            "textarea",
            "richedit",
        ],
    )
}

fn has_terminal_hint(candidate: &FocusCandidateDiagnostics) -> bool {
    has_any_hint(
        candidate,
        &[
            "termcontrol",
            "powershell",
            "pwsh",
            "command prompt",
            "cmd.exe",
            "xterm",
            "terminal",
            "cascadia",
        ],
    )
}

fn has_any_hint(candidate: &FocusCandidateDiagnostics, hints: &[&str]) -> bool {
    let framework = candidate.snapshot.framework_id.to_ascii_lowercase();
    let class_name = candidate.snapshot.class_name.to_ascii_lowercase();
    let automation_id = candidate.snapshot.automation_id.to_ascii_lowercase();
    let control_name = candidate.snapshot.control_name.to_ascii_lowercase();

    let has_hint = [
        framework.as_str(),
        class_name.as_str(),
        automation_id.as_str(),
        control_name.as_str(),
    ]
    .into_iter()
    .any(|value| hints.iter().any(|hint| value.contains(hint)));

    has_hint
}

fn candidate_accept_reason(candidate: &FocusCandidateDiagnostics) -> Option<String> {
    if candidate.has_active_caret {
        return Some("active caret owner via text pattern".to_string());
    }

    if looks_like_terminal_surface(candidate) {
        return Some("keyboard-focused terminal surface".to_string());
    }

    if has_writable_value_pattern(candidate) {
        return Some("writable value pattern control".to_string());
    }

    if looks_like_editor_surface(candidate) {
        return Some("keyboard-focused editor surface".to_string());
    }

    None
}

fn candidate_reject_reason(candidate: &FocusCandidateDiagnostics) -> String {
    if !candidate.is_enabled {
        return "candidate is disabled".to_string();
    }

    if candidate.is_read_only {
        return "candidate is read-only".to_string();
    }

    if !candidate.has_keyboard_focus {
        return "candidate does not own keyboard focus".to_string();
    }

    if !candidate.is_keyboard_focusable {
        return "candidate is not keyboard focusable".to_string();
    }

    "candidate did not expose a writable caret, text, or value contract".to_string()
}

#[cfg(test)]
impl FocusCandidateDiagnostics {
    pub(super) fn for_test(stable_id: &str) -> Self {
        Self {
            snapshot: FocusedFieldInfo {
                window_title: String::new(),
                control_name: String::new(),
                control_type: "Edit".to_string(),
                control_type_id: 50004,
                automation_id: String::new(),
                framework_id: String::new(),
                class_name: String::new(),
                current_value: String::new(),
                native_window_handle: 0,
                stable_id: stable_id.to_string(),
            },
            source: "unit_test".to_string(),
            has_keyboard_focus: false,
            is_keyboard_focusable: false,
            is_enabled: true,
            is_read_only: false,
            supports_value_pattern: false,
            supports_text_pattern: false,
            supports_text_pattern2: false,
            supports_text_edit_pattern: false,
            has_active_caret: false,
            selected_strategy: None,
            accept_reason: None,
            reject_reason: None,
            score: None,
        }
    }

    pub(super) fn with_window_title(mut self, value: &str) -> Self {
        self.snapshot.window_title = value.to_string();
        self
    }

    pub(super) fn with_control_type(mut self, value: &str, control_type_id: i32) -> Self {
        self.snapshot.control_type = value.to_string();
        self.snapshot.control_type_id = control_type_id;
        self
    }

    pub(super) fn with_framework_id(mut self, value: &str) -> Self {
        self.snapshot.framework_id = value.to_string();
        self
    }

    pub(super) fn with_class_name(mut self, value: &str) -> Self {
        self.snapshot.class_name = value.to_string();
        self
    }

    pub(super) fn with_keyboard_focus(mut self, value: bool) -> Self {
        self.has_keyboard_focus = value;
        self
    }

    pub(super) fn with_keyboard_focusable(mut self, value: bool) -> Self {
        self.is_keyboard_focusable = value;
        self
    }

    pub(super) fn with_value_pattern(mut self, value: bool) -> Self {
        self.supports_value_pattern = value;
        self
    }

    pub(super) fn with_text_pattern(mut self, value: bool) -> Self {
        self.supports_text_pattern = value;
        self
    }

    pub(super) fn with_text_pattern2(mut self, value: bool) -> Self {
        self.supports_text_pattern2 = value;
        self
    }

    pub(super) fn with_active_caret(mut self, value: bool) -> Self {
        self.has_active_caret = value;
        self
    }

    pub(super) fn with_read_only(mut self, value: bool) -> Self {
        self.is_read_only = value;
        self
    }

    pub(super) fn with_selected_strategy(mut self, value: InsertionStrategy) -> Self {
        self.selected_strategy = Some(value);
        self
    }

    pub(super) fn with_accept_reason(mut self, value: &str) -> Self {
        self.accept_reason = Some(value.to_string());
        self
    }

    pub(super) fn with_control_name(mut self, value: &str) -> Self {
        self.snapshot.control_name = value.to_string();
        self
    }
}
