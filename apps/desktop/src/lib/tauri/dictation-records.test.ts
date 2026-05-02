import { describe, expect, it } from "vitest";

import {
  createTauriCommandHarness,
  expectTauriCommand,
} from "@/test/tauri";

import {
  getRecentDictationRecords,
  saveDictationRecord,
  targetSnapshotFromFocusedField,
} from "./dictation-records";

describe("dictation record Tauri API", () => {
  it("loads recent dictation records through the backend history command", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_recent_dictation_records", [
      {
        schemaVersion: 1,
        recordId: "record-1",
        userId: "user-1",
        installationId: "installation-1",
        deviceId: "device-1",
        sessionId: "session-1",
        mode: "dictation",
        trigger: "hotkey",
        platform: "windows",
        capturedAt: "2026-05-02T08:30:00Z",
        startedAt: null,
        endedAt: null,
        target: {
          stableId: "target-1",
          windowTitle: "Discord",
          controlName: "Message",
          controlType: "Edit",
          controlTypeId: 50004,
          automationId: "message-input",
          frameworkId: "Win32",
          className: "Chrome_WidgetWin_1",
          nativeWindowHandle: 42,
          inputKind: "text",
          currentValue: null,
        },
        provider: null,
        transcript: {
          rawText: "hello",
          finalText: "hello",
          characterCount: 5,
        },
        insertion: {
          status: "inserted",
          method: "send_input",
          errorCode: null,
          errorMessage: null,
        },
      },
    ]);

    await expect(getRecentDictationRecords(12)).resolves.toHaveLength(1);
    expectTauriCommand(tauri, "get_recent_dictation_records", { limit: 12 });
  });

  it("saves dictation records through the backend history command", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("save_dictation_record", {
      schemaVersion: 1,
      recordId: "record-1",
      userId: "user-1",
      installationId: "installation-1",
      deviceId: "device-1",
      sessionId: "session-1",
      mode: "dictation",
      trigger: "hotkey",
      platform: "windows",
      capturedAt: "2026-05-02T08:30:00Z",
      startedAt: null,
      endedAt: null,
      target: {
        stableId: "target-1",
        windowTitle: "Discord",
        controlName: "Message",
        controlType: "Edit",
        controlTypeId: 50004,
        automationId: "message-input",
        frameworkId: "Win32",
        className: "Chrome_WidgetWin_1",
        nativeWindowHandle: 42,
        inputKind: "text",
        currentValue: null,
      },
      provider: null,
      transcript: {
        rawText: "hello",
        finalText: "hello",
        characterCount: 5,
      },
      insertion: {
        status: "inserted",
        method: "send_input",
        errorCode: null,
        errorMessage: null,
      },
    });

    await saveDictationRecord({
      mode: "dictation",
      trigger: "hotkey",
      capturedAt: "2026-05-02T08:30:00Z",
      startedAt: null,
      endedAt: null,
      target: {
        stableId: "target-1",
        windowTitle: "Discord",
        controlName: "Message",
        controlType: "Edit",
        controlTypeId: 50004,
        automationId: "message-input",
        frameworkId: "Win32",
        className: "Chrome_WidgetWin_1",
        nativeWindowHandle: 42,
        inputKind: "text",
        currentValue: null,
      },
      provider: null,
      transcript: {
        rawText: "hello",
        finalText: "hello",
        characterCount: 5,
      },
      insertion: {
        status: "inserted",
        method: "send_input",
        errorCode: null,
        errorMessage: null,
      },
    });

    expectTauriCommand(tauri, "save_dictation_record", {
      draft: expect.objectContaining({
        mode: "dictation",
        trigger: "hotkey",
      }),
    });
  });

  it("sanitizes editor accessibility placeholder text in target snapshots", () => {
    const snapshot = targetSnapshotFromFocusedField(
      {
        stableId: "target-1",
        windowTitle: "Visual Studio Code",
        controlName:
          "The editor is not accessible at this time. To enable screen reader optimized mode, use Shift+Alt+F1",
        controlType: "Document",
        controlTypeId: 50030,
        automationId: "editor",
        frameworkId: "Chrome",
        className: "Chrome_RenderWidgetHostHWND",
        nativeWindowHandle: 42,
        currentValue: "",
      },
      "editor",
    );

    expect(snapshot.controlName).toBe("Editor");
  });
});
