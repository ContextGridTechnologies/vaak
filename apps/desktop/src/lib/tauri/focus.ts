import { invokeTauri } from "./runtime";

export type FocusedFieldInfo = {
  windowTitle: string;
  controlName: string;
  controlType: string;
  controlTypeId: number;
  automationId: string;
  frameworkId: string;
  className: string;
  currentValue: string;
  nativeWindowHandle: number;
  stableId: string;
};

export type TextInsertResult = {
  method: string;
  characters: number;
};

export type CaptureInsertResult = {
  field: FocusedFieldInfo;
  insert: TextInsertResult;
};

export type PermissionStatus = {
  id: string;
  label: string;
  required: boolean;
  granted: boolean;
  guidance: string;
};

export type SessionHotkeyEvent = {
  mode: "dictation" | "command";
  phase: "start" | "stop";
  shortcut: string;
  field: FocusedFieldInfo | null;
  error: string | null;
};

export type HotkeyBindings = {
  dictation: string;
  command: string;
};

export async function getFocusedField(): Promise<FocusedFieldInfo> {
  return invokeTauri("get_focused_field");
}

export async function captureDictationTarget(): Promise<FocusedFieldInfo> {
  return invokeTauri("capture_dictation_target");
}

export async function insertText(text: string): Promise<TextInsertResult> {
  return invokeTauri("insert_text", { text });
}

export async function captureAndInsert(
  text: string,
): Promise<CaptureInsertResult> {
  return invokeTauri("capture_and_insert", { text });
}

export async function getAccessibilityPermissionStatus(): Promise<PermissionStatus> {
  return invokeTauri("get_accessibility_permission_status");
}

export async function getInputMonitoringPermissionStatus(): Promise<PermissionStatus> {
  return invokeTauri("get_input_monitoring_permission_status");
}

export async function insertIntoActiveTarget(
  text: string,
): Promise<TextInsertResult> {
  return invokeTauri("insert_into_active_target", { text });
}

export async function getHotkeyBindings(): Promise<HotkeyBindings> {
  return invokeTauri("get_hotkey_bindings");
}

export async function saveDictationHotkey(
  shortcut: string,
): Promise<HotkeyBindings> {
  return invokeTauri("save_dictation_hotkey", { shortcut });
}
