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

export async function insertText(text: string): Promise<TextInsertResult> {
  return invokeTauri("insert_text", { text });
}

export async function captureAndInsert(
  text: string,
): Promise<CaptureInsertResult> {
  return invokeTauri("capture_and_insert", { text });
}

export async function insertIntoActiveTarget(
  text: string,
): Promise<TextInsertResult> {
  return invokeTauri("insert_into_active_target", { text });
}

export async function getHotkeyBindings(): Promise<HotkeyBindings> {
  return invokeTauri("get_hotkey_bindings");
}
