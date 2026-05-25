import { describe, expect, it } from "vitest";

import {
  createTauriCommandHarness,
  expectTauriCommand,
} from "@/test/tauri";

import {
  captureDictationTarget,
  getAccessibilityPermissionStatus,
  getHotkeyBindings,
  getInputMonitoringPermissionStatus,
  insertIntoActiveTarget,
  saveDictationHotkey,
} from "./focus";

describe("focus Tauri API", () => {
  it("loads and saves dictation hotkey bindings through backend commands", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_hotkey_bindings", {
      dictation: "Ctrl+Win",
      command: "Ctrl+Win+Alt",
    });
    tauri.resolveCommand("save_dictation_hotkey", {
      dictation: "Ctrl+Shift",
      command: "Ctrl+Shift+Alt",
    });

    await expect(getHotkeyBindings()).resolves.toEqual({
      dictation: "Ctrl+Win",
      command: "Ctrl+Win+Alt",
    });
    await expect(saveDictationHotkey("Ctrl+Shift")).resolves.toEqual({
      dictation: "Ctrl+Shift",
      command: "Ctrl+Shift+Alt",
    });

    expectTauriCommand(tauri, "get_hotkey_bindings", undefined);
    expectTauriCommand(tauri, "save_dictation_hotkey", {
      shortcut: "Ctrl+Shift",
    });
  });

  it("inserts text only through the guarded active target command", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("insert_into_active_target", {
      characters: 5,
      method: "send_input",
    });

    await expect(insertIntoActiveTarget("hello")).resolves.toEqual({
      characters: 5,
      method: "send_input",
    });

    expectTauriCommand(tauri, "insert_into_active_target", {
      text: "hello",
    });
  });

  it("captures and stores the dictation target through the backend session command", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("capture_dictation_target", {
      automationId: "message-input",
      className: "Edit",
      controlName: "Message",
      controlType: "Edit",
      controlTypeId: 50004,
      currentValue: "",
      frameworkId: "Win32",
      nativeWindowHandle: 42,
      stableId: "window:42/control:message-input",
      windowTitle: "Notes",
    });

    await expect(captureDictationTarget()).resolves.toEqual({
      automationId: "message-input",
      className: "Edit",
      controlName: "Message",
      controlType: "Edit",
      controlTypeId: 50004,
      currentValue: "",
      frameworkId: "Win32",
      nativeWindowHandle: 42,
      stableId: "window:42/control:message-input",
      windowTitle: "Notes",
    });

    expectTauriCommand(tauri, "capture_dictation_target", undefined);
  });

  it("loads platform accessibility permission status through the backend command", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_accessibility_permission_status", {
      granted: false,
      guidance:
        "Grant Accessibility access to Vaak in System Settings > Privacy & Security > Accessibility.",
      id: "accessibility",
      label: "Accessibility",
      required: true,
    });

    await expect(getAccessibilityPermissionStatus()).resolves.toEqual({
      granted: false,
      guidance:
        "Grant Accessibility access to Vaak in System Settings > Privacy & Security > Accessibility.",
      id: "accessibility",
      label: "Accessibility",
      required: true,
    });

    expectTauriCommand(
      tauri,
      "get_accessibility_permission_status",
      undefined,
    );
  });

  it("loads platform input monitoring permission status through the backend command", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_input_monitoring_permission_status", {
      granted: false,
      guidance:
        "Grant Input Monitoring access to Vaak in System Settings > Privacy & Security > Input Monitoring.",
      id: "input_monitoring",
      label: "Input Monitoring",
      required: true,
    });

    await expect(getInputMonitoringPermissionStatus()).resolves.toEqual({
      granted: false,
      guidance:
        "Grant Input Monitoring access to Vaak in System Settings > Privacy & Security > Input Monitoring.",
      id: "input_monitoring",
      label: "Input Monitoring",
      required: true,
    });

    expectTauriCommand(
      tauri,
      "get_input_monitoring_permission_status",
      undefined,
    );
  });
});
