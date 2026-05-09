use crate::platform::common::{FocusedFieldInfo, PlatformError};
use crate::platform::windows::com::ComInit;
use crate::platform::windows::targeting::{
    evaluate_candidates, next_operation_id, FocusCandidateDiagnostics, LogPayload,
};
use crate::platform::windows::uia::{
    active_caret_owner, bstr_to_string, collect_ancestor_chain, control_type_to_string,
    create_automation, get_current_value, get_focused_element, get_text_edit_pattern,
    get_text_pattern, get_text_pattern2, get_value_pattern, has_keyboard_focus, is_enabled,
    is_keyboard_focusable, is_read_only, window_title_from_handle,
};
use std::collections::HashSet;
use windows::Win32::UI::Accessibility::IUIAutomation;
use windows::Win32::UI::Accessibility::IUIAutomationElement;

#[cfg(test)]
use crate::platform::windows::targeting::{
    score_candidate, select_best_candidate, InsertionStrategy,
};

const MAX_ANCESTOR_DEPTH: usize = 6;
const LOG_TARGET: &str = "vaak::platform::windows";

pub(super) struct ResolvedFocusTarget {
    pub element: IUIAutomationElement,
    pub diagnostics: FocusCandidateDiagnostics,
}

pub(crate) fn get_focused_field() -> Result<FocusedFieldInfo, PlatformError> {
    let _com = ComInit::new()?;
    let automation = create_automation()?;
    let operation_id = next_operation_id("focus");
    let target = resolve_focused_target(&automation, &operation_id)?;
    Ok(target.diagnostics.snapshot)
}

pub(crate) fn build_focused_field_info(element: &IUIAutomationElement) -> FocusedFieldInfo {
    let control_type_id = unsafe { element.CurrentControlType() }.unwrap_or_default();
    let control_type_id_value = control_type_id.0;

    let native_handle = unsafe { element.CurrentNativeWindowHandle() }.unwrap_or_default();
    let native_handle_value = native_handle.0 as i64;

    let window_title = window_title_from_handle(native_handle);
    let control_name = bstr_to_string(unsafe { element.CurrentName() });
    let automation_id = bstr_to_string(unsafe { element.CurrentAutomationId() });
    let framework_id = bstr_to_string(unsafe { element.CurrentFrameworkId() });
    let class_name = bstr_to_string(unsafe { element.CurrentClassName() });
    let current_value = get_current_value(element);
    let stable_id = build_stable_id(
        native_handle_value,
        &automation_id,
        &class_name,
        control_type_id_value,
    );

    FocusedFieldInfo {
        window_title,
        control_name,
        control_type: control_type_to_string(control_type_id_value),
        control_type_id: control_type_id_value,
        automation_id,
        framework_id,
        class_name,
        current_value,
        native_window_handle: native_handle_value,
        stable_id,
    }
}

pub(super) fn resolve_focused_target(
    automation: &IUIAutomation,
    operation_id: &str,
) -> Result<ResolvedFocusTarget, PlatformError> {
    let focused = get_focused_element(automation)?;
    let focused_candidate = build_focus_candidate(&focused, "focused_element");
    log::info!(
        target: LOG_TARGET,
        "{}",
        serialize_log_payload(LogPayload::candidate_event(
            "focus_capture_started",
            operation_id,
            &focused_candidate,
            None,
        ))
    );

    let mut seen = HashSet::new();
    let mut candidates = Vec::new();
    push_candidate(
        &mut candidates,
        &mut seen,
        focused.clone(),
        "focused_element",
    );

    let raw_walker = unsafe { automation.RawViewWalker() }
        .map_err(|err| PlatformError::new("windows_error", format!("RawViewWalker: {err}")))?;
    let control_walker = unsafe { automation.ControlViewWalker() }
        .map_err(|err| PlatformError::new("windows_error", format!("ControlViewWalker: {err}")))?;

    for ancestor in collect_ancestor_chain(&raw_walker, &focused, MAX_ANCESTOR_DEPTH) {
        push_candidate(&mut candidates, &mut seen, ancestor, "raw_ancestor");
    }

    for ancestor in collect_ancestor_chain(&control_walker, &focused, MAX_ANCESTOR_DEPTH) {
        push_candidate(&mut candidates, &mut seen, ancestor, "control_ancestor");
    }

    let initial_elements: Vec<IUIAutomationElement> = candidates
        .iter()
        .map(|candidate| candidate.element.clone())
        .collect();
    for element in initial_elements {
        if let Some((owner, is_active)) = active_caret_owner(&element) {
            if is_active {
                push_candidate(
                    &mut candidates,
                    &mut seen,
                    owner,
                    "text_pattern2_caret_owner",
                );
            }
        }
    }

    let (evaluated, selected_index) = evaluate_candidates(
        candidates
            .iter()
            .map(|candidate| candidate.diagnostics.clone())
            .collect(),
    );

    for candidate in &evaluated {
        log::info!(
            target: LOG_TARGET,
            "{}",
            serialize_log_payload(LogPayload::candidate_event(
                "focus_candidate_evaluated",
                operation_id,
                candidate,
                None,
            ))
        );
    }

    let Some(selected_index) = selected_index else {
        let error = PlatformError::new(
            "no_focused_target",
            "No writable focused field found near the active focus",
        );
        log::warn!(
            target: LOG_TARGET,
            "{}",
            serialize_log_payload(LogPayload::candidate_event(
                "focus_target_not_found",
                operation_id,
                &focused_candidate,
                Some(&error),
            ))
        );
        return Err(error);
    };

    let diagnostics = evaluated[selected_index].clone();
    let focused_key = descriptor_key(&focused_candidate.snapshot);
    let ancestor_snapshots: Vec<FocusedFieldInfo> = candidates
        .iter()
        .filter(|candidate| {
            matches!(
                candidate.diagnostics.source.as_str(),
                "raw_ancestor" | "control_ancestor"
            )
        })
        .map(|candidate| candidate.diagnostics.snapshot.clone())
        .collect();
    let mut diagnostics = diagnostics;
    if descriptor_key(&diagnostics.snapshot) == focused_key {
        enrich_snapshot_identity(&mut diagnostics.snapshot, &ancestor_snapshots);
    }
    let element = candidates[selected_index].element.clone();
    log::info!(
        target: LOG_TARGET,
        "{}",
        serialize_log_payload(LogPayload::candidate_event(
            "focus_target_selected",
            operation_id,
            &diagnostics,
            None,
        ))
    );

    Ok(ResolvedFocusTarget {
        element,
        diagnostics,
    })
}

struct FocusCandidate {
    element: IUIAutomationElement,
    diagnostics: FocusCandidateDiagnostics,
}

fn build_focus_candidate(
    element: &IUIAutomationElement,
    source: &str,
) -> FocusCandidateDiagnostics {
    let caret_is_active = active_caret_owner(element)
        .map(|(_, is_active)| is_active)
        .unwrap_or(false)
        || source == "text_pattern2_caret_owner";

    FocusCandidateDiagnostics {
        snapshot: build_focused_field_info(element),
        source: source.to_string(),
        has_keyboard_focus: has_keyboard_focus(element),
        is_keyboard_focusable: is_keyboard_focusable(element),
        is_enabled: is_enabled(element),
        is_read_only: is_read_only(element),
        supports_value_pattern: get_value_pattern(element).is_some(),
        supports_text_pattern: get_text_pattern(element).is_some(),
        supports_text_pattern2: get_text_pattern2(element).is_some(),
        supports_text_edit_pattern: get_text_edit_pattern(element).is_some(),
        has_active_caret: caret_is_active,
        selected_strategy: None,
        accept_reason: None,
        reject_reason: None,
        score: None,
    }
}

fn push_candidate(
    candidates: &mut Vec<FocusCandidate>,
    seen: &mut HashSet<String>,
    element: IUIAutomationElement,
    source: &str,
) {
    let diagnostics = build_focus_candidate(&element, source);
    let key = descriptor_key(&diagnostics.snapshot);
    if seen.insert(key) {
        candidates.push(FocusCandidate {
            element,
            diagnostics,
        });
    } else if source == "text_pattern2_caret_owner" {
        for candidate in candidates.iter_mut() {
            if descriptor_key(&candidate.diagnostics.snapshot)
                == descriptor_key(&diagnostics.snapshot)
            {
                candidate.diagnostics.has_active_caret = true;
                candidate.diagnostics.source = source.to_string();
                break;
            }
        }
    }
}

fn descriptor_key(snapshot: &FocusedFieldInfo) -> String {
    format!(
        "{}:{}:{}:{}:{}",
        snapshot.native_window_handle,
        snapshot.control_type_id,
        snapshot.automation_id,
        snapshot.class_name,
        snapshot.control_name
    )
}

fn serialize_log_payload(payload: LogPayload) -> String {
    serde_json::to_string(&payload).unwrap_or_else(|err| {
        format!(
            "{{\"event\":\"log_serialization_failed\",\"message\":\"{}\"}}",
            err
        )
    })
}

fn build_stable_id(
    native_handle: i64,
    automation_id: &str,
    class_name: &str,
    control_type_id: i32,
) -> String {
    if !automation_id.is_empty() {
        format!("{native_handle}:{automation_id}")
    } else if !class_name.is_empty() {
        format!("{native_handle}:{class_name}:{control_type_id}")
    } else {
        format!("{native_handle}:{control_type_id}")
    }
}

fn enrich_snapshot_identity(
    snapshot: &mut FocusedFieldInfo,
    ancestors: &[FocusedFieldInfo],
) -> bool {
    if snapshot.native_window_handle != 0 && !snapshot.window_title.is_empty() {
        return false;
    }

    let fallback_title = ancestors.iter().find_map(|ancestor| {
        (!ancestor.window_title.is_empty()).then(|| ancestor.window_title.clone())
    });
    let fallback_class_name = ancestors.iter().find_map(|ancestor| {
        (!ancestor.class_name.is_empty()).then(|| ancestor.class_name.clone())
    });
    let fallback_handle = ancestors.iter().find_map(|ancestor| {
        (ancestor.native_window_handle != 0).then_some(ancestor.native_window_handle)
    });

    let used_fallback =
        fallback_title.is_some() || fallback_class_name.is_some() || fallback_handle.is_some();
    if !used_fallback {
        return false;
    }

    if let Some(window_title) = fallback_title {
        snapshot.window_title = window_title;
    }
    if let Some(class_name) = fallback_class_name {
        snapshot.class_name = class_name;
    }
    if let Some(native_window_handle) = fallback_handle {
        snapshot.native_window_handle = native_window_handle;
    }
    snapshot.stable_id = build_stable_id(
        snapshot.native_window_handle,
        &snapshot.automation_id,
        &snapshot.class_name,
        snapshot.control_type_id,
    );

    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn candidate_scoring_prioritizes_active_caret_then_writable_value_then_editor_surface() {
        let caret_owner = FocusCandidateDiagnostics::for_test("caret-owner")
            .with_control_type("Document", 50030)
            .with_keyboard_focus(true)
            .with_keyboard_focusable(true)
            .with_text_pattern2(true)
            .with_active_caret(true);
        let writable_value = FocusCandidateDiagnostics::for_test("value-pattern")
            .with_control_type("Edit", 50004)
            .with_value_pattern(true)
            .with_read_only(false);
        let editor_surface = FocusCandidateDiagnostics::for_test("editor-surface")
            .with_control_type("Pane", 50033)
            .with_keyboard_focus(true)
            .with_keyboard_focusable(true)
            .with_text_pattern(true)
            .with_framework_id("Chrome")
            .with_class_name("Chrome_RenderWidgetHostHWND");

        assert!(score_candidate(&caret_owner) > score_candidate(&writable_value));
        assert!(score_candidate(&writable_value) > score_candidate(&editor_surface));
    }

    #[test]
    fn best_candidate_selection_prefers_highest_scoring_entry() {
        let candidates = vec![
            FocusCandidateDiagnostics::for_test("raw-focused")
                .with_control_type("Custom", 50025)
                .with_keyboard_focus(true)
                .with_keyboard_focusable(true)
                .with_text_pattern(true)
                .with_framework_id("Chrome")
                .with_class_name("Chrome_RenderWidgetHostHWND"),
            FocusCandidateDiagnostics::for_test("caret-owner")
                .with_control_type("Document", 50030)
                .with_keyboard_focus(true)
                .with_keyboard_focusable(true)
                .with_text_pattern2(true)
                .with_active_caret(true),
        ];

        let selected = select_best_candidate(candidates).expect("candidate should be selected");

        assert_eq!(selected.snapshot.stable_id, "caret-owner");
        assert_eq!(
            selected.accept_reason.as_deref(),
            Some("active caret owner via text pattern")
        );
    }

    #[test]
    fn best_candidate_selection_accepts_keyboard_focused_terminal_text_leaf() {
        let candidates = vec![FocusCandidateDiagnostics::for_test("termcontrol-leaf")
            .with_control_type("Text", 50020)
            .with_keyboard_focus(true)
            .with_keyboard_focusable(true)
            .with_text_pattern(true)
            .with_framework_id("XAML")
            .with_class_name("TermControl")
            .with_control_name("PowerShell")];

        let selected = select_best_candidate(candidates).expect("terminal leaf should be selected");

        assert_eq!(selected.snapshot.stable_id, "termcontrol-leaf");
        assert_eq!(
            selected.accept_reason.as_deref(),
            Some("keyboard-focused terminal surface")
        );
        assert_eq!(
            selected.selected_strategy,
            Some(InsertionStrategy::SendInput)
        );
    }

    #[test]
    fn best_candidate_selection_prefers_send_input_for_focused_chromium_terminal_textarea() {
        let candidates = vec![FocusCandidateDiagnostics::for_test("xterm-helper")
            .with_control_type("Edit", 50004)
            .with_keyboard_focus(true)
            .with_keyboard_focusable(true)
            .with_value_pattern(true)
            .with_text_pattern(true)
            .with_framework_id("Chrome")
            .with_class_name("xterm-helper-textarea")
            .with_control_name("pwsh")];

        let selected =
            select_best_candidate(candidates).expect("chromium terminal helper should be selected");

        assert_eq!(selected.snapshot.stable_id, "xterm-helper");
        assert_eq!(
            selected.accept_reason.as_deref(),
            Some("keyboard-focused terminal surface")
        );
        assert_eq!(
            selected.selected_strategy,
            Some(InsertionStrategy::SendInput)
        );
    }

    #[test]
    fn best_candidate_selection_rejects_generic_text_without_terminal_hints() {
        let candidates = vec![FocusCandidateDiagnostics::for_test("generic-text")
            .with_control_type("Text", 50020)
            .with_keyboard_focus(true)
            .with_keyboard_focusable(true)
            .with_text_pattern(true)
            .with_framework_id("XAML")
            .with_class_name("TextBlock")
            .with_control_name("Output")];

        let selected = select_best_candidate(candidates);

        assert!(selected.is_none());
    }

    #[test]
    fn best_candidate_selection_does_not_promote_unfocused_terminal_ancestor() {
        let candidates = vec![
            FocusCandidateDiagnostics::for_test("focused-text")
                .with_control_type("Text", 50020)
                .with_keyboard_focus(true)
                .with_keyboard_focusable(true)
                .with_text_pattern(true)
                .with_framework_id("XAML")
                .with_class_name("TextBlock")
                .with_control_name("Output"),
            FocusCandidateDiagnostics::for_test("terminal-ancestor")
                .with_control_type("Pane", 50033)
                .with_keyboard_focus(false)
                .with_keyboard_focusable(true)
                .with_text_pattern(true)
                .with_framework_id("Win32")
                .with_class_name("CASCADIA_HOSTING_WINDOW_CLASS")
                .with_control_name("Windows Terminal"),
        ];

        let selected = select_best_candidate(candidates);

        assert!(selected.is_none());
    }

    #[test]
    fn focus_log_payload_flattens_pattern_flags_and_strategy() {
        let candidate = FocusCandidateDiagnostics::for_test("caret-owner")
            .with_window_title("Visual Studio Code")
            .with_control_type("Document", 50030)
            .with_framework_id("Chrome")
            .with_class_name("Chrome_RenderWidgetHostHWND")
            .with_text_pattern(true)
            .with_text_pattern2(true)
            .with_active_caret(true)
            .with_selected_strategy(InsertionStrategy::ClipboardPaste)
            .with_accept_reason("active caret owner via text pattern");

        let payload =
            LogPayload::candidate_event("focus_target_selected", "focus-42", &candidate, None);
        let json = serde_json::to_value(payload).expect("payload should serialize");

        assert_eq!(json["event"], "focus_target_selected");
        assert_eq!(json["operationId"], "focus-42");
        assert_eq!(json["windowTitle"], "Visual Studio Code");
        assert_eq!(json["stableId"], "caret-owner");
        assert_eq!(json["supportsTextPattern"], true);
        assert_eq!(json["supportsTextPattern2"], true);
        assert_eq!(json["chosenStrategy"], "clipboard_paste");
        assert_eq!(json["reason"], "active caret owner via text pattern");
    }

    #[test]
    fn enriches_terminal_leaf_metadata_from_nearest_meaningful_ancestor() {
        let mut snapshot = FocusedFieldInfo {
            window_title: String::new(),
            control_name: "PowerShell".to_string(),
            control_type: "Text".to_string(),
            control_type_id: 50020,
            automation_id: String::new(),
            framework_id: "XAML".to_string(),
            class_name: "TermControl".to_string(),
            current_value: String::new(),
            native_window_handle: 0,
            stable_id: "0:TermControl:50020".to_string(),
        };
        let ancestors = vec![
            FocusedFieldInfo {
                window_title: String::new(),
                control_name: "Terminal Content".to_string(),
                control_type: "Pane".to_string(),
                control_type_id: 50033,
                automation_id: String::new(),
                framework_id: "XAML".to_string(),
                class_name: String::new(),
                current_value: String::new(),
                native_window_handle: 0,
                stable_id: "0:50033".to_string(),
            },
            FocusedFieldInfo {
                window_title: "Windows Terminal".to_string(),
                control_name: "Terminal Window".to_string(),
                control_type: "Window".to_string(),
                control_type_id: 50032,
                automation_id: String::new(),
                framework_id: "Win32".to_string(),
                class_name: "CASCADIA_HOSTING_WINDOW_CLASS".to_string(),
                current_value: String::new(),
                native_window_handle: 4242,
                stable_id: "4242:CASCADIA_HOSTING_WINDOW_CLASS:50032".to_string(),
            },
        ];

        let used_fallback = enrich_snapshot_identity(&mut snapshot, &ancestors);

        assert!(used_fallback);
        assert_eq!(snapshot.window_title, "Windows Terminal");
        assert_eq!(snapshot.class_name, "CASCADIA_HOSTING_WINDOW_CLASS");
        assert_eq!(snapshot.native_window_handle, 4242);
    }

    #[test]
    fn enriched_identity_produces_stronger_stable_id() {
        let mut snapshot = FocusedFieldInfo {
            window_title: String::new(),
            control_name: "PowerShell".to_string(),
            control_type: "Text".to_string(),
            control_type_id: 50020,
            automation_id: String::new(),
            framework_id: "XAML".to_string(),
            class_name: "TermControl".to_string(),
            current_value: String::new(),
            native_window_handle: 0,
            stable_id: build_stable_id(0, "", "TermControl", 50020),
        };
        let ancestors = vec![FocusedFieldInfo {
            window_title: "Windows Terminal".to_string(),
            control_name: "Terminal Window".to_string(),
            control_type: "Window".to_string(),
            control_type_id: 50032,
            automation_id: String::new(),
            framework_id: "Win32".to_string(),
            class_name: "CASCADIA_HOSTING_WINDOW_CLASS".to_string(),
            current_value: String::new(),
            native_window_handle: 4242,
            stable_id: "4242:CASCADIA_HOSTING_WINDOW_CLASS:50032".to_string(),
        }];

        enrich_snapshot_identity(&mut snapshot, &ancestors);

        assert_eq!(
            snapshot.stable_id,
            "4242:CASCADIA_HOSTING_WINDOW_CLASS:50020"
        );
    }
}
