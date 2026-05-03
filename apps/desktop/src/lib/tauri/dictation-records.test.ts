import { describe, expect, it } from "vitest";

import {
  createTauriCommandHarness,
  expectTauriCommand,
} from "@/test/tauri";

import {
  exportSavedDictationAudio,
  getRecentDictationRecords,
  loadSavedDictationAudio,
  persistDictationAudio,
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
        recording: {
          analysisMs: 12,
          insertionMs: 9,
          postProcessingMs: 1044,
          startupMs: 42,
          streamAcquisitionMs: 18,
          reusedWarmStream: false,
          transcriptionMs: 1023,
        },
        audio: {
          relativePath: "recordings/2026/05/02/record-1.webm",
          mimeType: "audio/webm",
          byteLength: 2048,
        },
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

    await expect(getRecentDictationRecords(12, 24)).resolves.toHaveLength(1);
    expectTauriCommand(tauri, "get_recent_dictation_records", {
      limit: 12,
      offset: 24,
    });
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
      recording: {
        analysisMs: 12,
        insertionMs: 9,
        postProcessingMs: 1044,
        startupMs: 42,
        streamAcquisitionMs: 18,
        reusedWarmStream: false,
        transcriptionMs: 1023,
      },
      audio: {
        relativePath: "recordings/2026/05/02/record-1.webm",
        mimeType: "audio/webm",
        byteLength: 2048,
      },
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
      recording: {
        startupMs: 42,
        streamAcquisitionMs: 18,
        reusedWarmStream: false,
      },
      audio: {
        relativePath: "recordings/2026/05/02/record-1.webm",
        mimeType: "audio/webm",
        byteLength: 2048,
      },
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

  it("persists recorded audio through the backend storage command", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("persist_dictation_audio", {
      relativePath: "recordings/2026/05/02/record-1.webm",
      mimeType: "audio/webm",
      byteLength: 3,
    });

    const audioBlob = new Blob([new Uint8Array([1, 2, 3])], {
      type: "audio/webm",
    });

    await expect(
      persistDictationAudio({
        audioBlob,
        capturedAt: "2026-05-02T08:30:00Z",
      }),
    ).resolves.toEqual({
      relativePath: "recordings/2026/05/02/record-1.webm",
      mimeType: "audio/webm",
      byteLength: 3,
    });

    expectTauriCommand(tauri, "persist_dictation_audio", {
      audioBytes: [1, 2, 3],
      capturedAt: "2026-05-02T08:30:00Z",
      mimeType: "audio/webm",
    });
  });

  it("loads persisted recorded audio through the backend storage command", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("load_saved_dictation_audio", {
      audioBytes: [1, 2, 3],
      mimeType: "audio/webm",
    });

    await expect(
      loadSavedDictationAudio("recordings/2026/05/02/record-1.webm"),
    ).resolves.toEqual({
      audioBytes: new Uint8Array([1, 2, 3]),
      mimeType: "audio/webm",
    });

    expectTauriCommand(tauri, "load_saved_dictation_audio", {
      relativePath: "recordings/2026/05/02/record-1.webm",
    });
  });

  it("exports persisted recorded audio to a user-visible path through the backend storage command", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("export_saved_dictation_audio", {
      savedPath: "C:\\Users\\nikhi\\Downloads\\Vaak\\record-1.webm",
      fileName: "record-1.webm",
    });

    await expect(
      exportSavedDictationAudio("recordings/2026/05/02/record-1.webm"),
    ).resolves.toEqual({
      savedPath: "C:\\Users\\nikhi\\Downloads\\Vaak\\record-1.webm",
      fileName: "record-1.webm",
    });

    expectTauriCommand(tauri, "export_saved_dictation_audio", {
      relativePath: "recordings/2026/05/02/record-1.webm",
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
