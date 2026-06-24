import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderApp } from "@/test/render";

import {
  AnalyticsPanel,
  resetAnalyticsSnapshotCacheForTests,
} from "./AnalyticsPanel";

const {
  getAllRecentDictationRecords,
  getDiagnosticsLocations,
  getRecentDictationRecords,
  isTauriRuntime,
} = vi.hoisted(() => ({
  getAllRecentDictationRecords: vi.fn(),
  getDiagnosticsLocations: vi.fn(),
  getRecentDictationRecords: vi.fn(),
  isTauriRuntime: vi.fn(),
}));

vi.mock("@/lib/tauri", () => ({
  getAllRecentDictationRecords,
  getDiagnosticsLocations,
  getRecentDictationRecords,
  isTauriRuntime,
}));

describe("AnalyticsPanel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetAnalyticsSnapshotCacheForTests();
    vi.spyOn(Date, "now").mockReturnValue(
      new Date("2026-06-12T12:00:00.000Z").getTime(),
    );
    isTauriRuntime.mockReturnValue(true);
    getDiagnosticsLocations.mockResolvedValue({
      appDataDir: "C:\\Users\\nikhi\\AppData\\Roaming\\Vaak",
      configDir: "C:\\Users\\nikhi\\AppData\\Roaming\\Vaak",
      logDir: "C:\\Users\\nikhi\\AppData\\Local\\Vaak\\logs",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders user-facing local dictation analytics", async () => {
    getAllRecentDictationRecords.mockResolvedValue([
      createRecord({
        recordId: "record-1",
        status: "inserted",
        providerId: "openai",
        modelId: "gpt-4o-transcribe",
        capturedAt: "2026-06-12T09:00:00.000Z",
        startedAt: "2026-06-12T09:00:00.000Z",
        endedAt: "2026-06-12T09:00:02.000Z",
        windowTitle: "Visual Studio Code",
        finalText: "Implementing the user analytics dashboard with a focused weekly productivity view",
      }),
      createRecord({
        recordId: "record-2",
        status: "failed",
        providerId: "deepgram",
        modelId: "nova-3",
        capturedAt: "2026-06-12T10:00:00.000Z",
        startedAt: "2026-06-12T10:00:00.000Z",
        endedAt: "2026-06-12T10:00:03.000Z",
        errorMessage: "Insertion target rejected text.",
        windowTitle: "Notepad",
        finalText: "This failed dictation should not count toward user productivity totals",
      }),
      createRecord({
        recordId: "record-3",
        status: "recovered",
        providerId: "openai",
        modelId: "gpt-4o-transcribe",
        capturedAt: "2026-06-11T10:00:00.000Z",
        startedAt: "2026-06-11T10:00:00.000Z",
        endedAt: "2026-06-11T10:00:01.000Z",
        windowTitle: "Chrome",
        finalText: "Research notes for a cleaner analytics dashboard design",
      }),
    ]);

    renderApp(<AnalyticsPanel />);

    await waitFor(() =>
      expect(screen.getByText("Time saved")).toBeInTheDocument(),
    );
    expect(screen.getByText("Words dictated")).toBeInTheDocument();
    expect(screen.getByText("Dictations")).toBeInTheDocument();
    expect(screen.getByText("Active days")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Productivity this week" })).toBeInTheDocument();
    expect(screen.getByText("Most used apps")).toBeInTheDocument();
    expect(screen.getByText("VS Code")).toBeInTheDocument();
    expect(screen.getByText("Chrome")).toBeInTheDocument();
    expect(screen.queryByText("Recent activity")).not.toBeInTheDocument();
    expect(screen.queryByText("Recent dictations")).not.toBeInTheDocument();
    expect(screen.queryByText("Insertion target rejected text.")).not.toBeInTheDocument();
  });

  it("reuses the loaded analytics snapshot across remounts", async () => {
    getAllRecentDictationRecords.mockResolvedValue([
      createRecord({
        recordId: "record-1",
        status: "inserted",
        providerId: "openai",
        modelId: "gpt-4o-transcribe",
        capturedAt: "2026-06-12T09:00:00.000Z",
        startedAt: "2026-06-12T09:00:00.000Z",
        endedAt: "2026-06-12T09:00:02.000Z",
        windowTitle: "Visual Studio Code",
      }),
    ]);

    const { unmount } = renderApp(<AnalyticsPanel />);

    await waitFor(() => expect(screen.getByText("1 of 7")).toBeInTheDocument());
    expect(getAllRecentDictationRecords).toHaveBeenCalledTimes(1);

    unmount();
    renderApp(<AnalyticsPanel />);

    expect(await screen.findByText("1 of 7")).toBeInTheDocument();
    expect(getAllRecentDictationRecords).toHaveBeenCalledTimes(1);
  });

  it("shows a desktop-runtime error outside Tauri", async () => {
    isTauriRuntime.mockReturnValue(false);

    renderApp(<AnalyticsPanel />);

    await waitFor(() =>
      expect(
        screen.getByText("Analytics reads local activity only in the desktop runtime."),
      ).toBeInTheDocument(),
    );
    expect(getRecentDictationRecords).not.toHaveBeenCalled();
    expect(getAllRecentDictationRecords).not.toHaveBeenCalled();
  });

  it("normalizes local app labels for the most-used apps list", async () => {
    getAllRecentDictationRecords.mockResolvedValue([
      createRecord({
        recordId: "record-1",
        status: "inserted",
        providerId: "openai",
        modelId: "gpt-4o-transcribe",
        capturedAt: "2026-06-12T09:00:00.000Z",
        startedAt: "2026-06-12T09:00:00.000Z",
        endedAt: "2026-06-12T09:00:02.000Z",
        windowTitle: "\u1361 vaak",
      }),
    ]);

    renderApp(<AnalyticsPanel />);

    await waitFor(() => expect(screen.getByText("Vaak")).toBeInTheDocument());
    expect(screen.queryByText("\u1361 vaak")).not.toBeInTheDocument();
  });

  it("limits weekly analytics totals to the displayed seven-day range", async () => {
    vi.spyOn(Date, "now").mockReturnValue(
      new Date("2026-06-12T12:00:00.000Z").getTime(),
    );
    getAllRecentDictationRecords.mockResolvedValue([
      ...Array.from({ length: 7 }, (_, index) => {
        const day = String(12 - index).padStart(2, "0");

        return createRecord({
          recordId: `record-${index + 1}`,
          status: "inserted",
          providerId: "openai",
          modelId: "gpt-4o-transcribe",
          capturedAt: `2026-06-${day}T09:00:00.000Z`,
          startedAt: `2026-06-${day}T09:00:00.000Z`,
          endedAt: `2026-06-${day}T09:00:01.000Z`,
          windowTitle: "Visual Studio Code",
        });
      }),
      createRecord({
        recordId: "record-8",
        status: "inserted",
        providerId: "openai",
        modelId: "gpt-4o-transcribe",
        capturedAt: "2026-06-05T09:00:00.000Z",
        startedAt: "2026-06-05T09:00:00.000Z",
        endedAt: "2026-06-05T09:00:01.000Z",
        windowTitle: "Legacy Editor",
      }),
    ]);

    renderApp(<AnalyticsPanel />);

    await waitFor(() => expect(screen.getByText("7 of 7")).toBeInTheDocument());
    expect(screen.queryByText("8 of 7")).not.toBeInTheDocument();
    expect(screen.queryByText("Legacy Editor")).not.toBeInTheDocument();
  });
});

type CreateRecordInput = {
  recordId: string;
  status: "inserted" | "skipped" | "failed" | "recovered";
  providerId: string;
  modelId: string;
  capturedAt: string;
  startedAt: string;
  endedAt: string;
  windowTitle: string;
  errorMessage?: string;
  finalText?: string;
};

function createRecord(input: CreateRecordInput) {
  return {
    schemaVersion: 1,
    recordId: input.recordId,
    userId: "local-user",
    installationId: "installation-1",
    deviceId: "device-1",
    sessionId: "session-1",
    platform: "windows",
    mode: "dictation",
    trigger: "hotkey",
    capturedAt: input.capturedAt,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    recording: {
      startupMs: 80,
      streamAcquisitionMs: 120,
      reusedWarmStream: true,
      analysisMs: 30,
      transcriptionMs: 700,
      insertionMs: 90,
      postProcessingMs: 25,
    },
    audio: null,
    processedAudio: null,
    target: {
      stableId: "target-1",
      windowTitle: input.windowTitle,
      controlName: "Editor",
      controlType: "Edit",
      controlTypeId: 50004,
      automationId: "",
      frameworkId: "Win32",
      className: "",
      nativeWindowHandle: 100,
      inputKind: "editor",
      currentValue: null,
    },
    provider: {
      providerId: input.providerId,
      modelId: input.modelId,
    },
    transcript: {
      rawText: "hello world",
      finalText: input.finalText ?? "hello world",
      characterCount: input.finalText?.length ?? 11,
    },
    insertion: {
      status: input.status,
      method: "clipboard",
      errorCode: input.status === "failed" ? "insert_failed" : null,
      errorMessage: input.errorMessage ?? null,
    },
  };
}
