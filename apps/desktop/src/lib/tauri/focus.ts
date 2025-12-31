import { invoke } from "@tauri-apps/api/core";

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

export async function getFocusedField(): Promise<FocusedFieldInfo> {
  return invoke("get_focused_field");
}

export async function insertText(text: string): Promise<TextInsertResult> {
  return invoke("insert_text", { text });
}

export async function captureAndInsert(
  text: string,
): Promise<CaptureInsertResult> {
  return invoke("capture_and_insert", { text });
}
