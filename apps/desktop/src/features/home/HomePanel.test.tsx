import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderApp } from "@/test/render";

import { HomePanel } from "./HomePanel";

const {
  getRecentDictationRecords,
  exportSavedDictationAudio,
  isTauriRuntime,
  loadSavedDictationAudio,
  sanitizeTargetControlName,
} = vi.hoisted(() => ({
  getRecentDictationRecords: vi.fn(),
  exportSavedDictationAudio: vi.fn(),
  isTauriRuntime: vi.fn(),
  loadSavedDictationAudio: vi.fn(),
  sanitizeTargetControlName: vi.fn(),
}));

vi.mock("@/lib/tauri", () => ({
  exportSavedDictationAudio,
  getRecentDictationRecords,
  isTauriRuntime,
  loadSavedDictationAudio,
  sanitizeTargetControlName,
}));

const { revealItemInDir } = vi.hoisted(() => ({
  revealItemInDir: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir,
}));

const { appEnvironment } = vi.hoisted(() => ({
  appEnvironment: {
    appEnv: "development",
    cloudBaseUrl: null,
    enableDebugUi: false,
    exposeProcessedAudioArtifacts: true,
  },
}));

vi.mock("@/config/app-env", () => ({
  appEnvironment,
}));

describe("HomePanel", () => {
  let intersectionObserverCallback:
    | ((entries: Array<{ isIntersecting: boolean }>) => void)
    | null;
  let observeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    intersectionObserverCallback = null;
    observeSpy = vi.fn();
    class MockIntersectionObserver {
      observe = observeSpy;
      unobserve = vi.fn();
      disconnect = vi.fn();
      root = null;
      rootMargin = "";
      thresholds: number[] = [];

      constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
        intersectionObserverCallback = callback;
      }

      takeRecords() {
        return [];
      }
    }

    globalThis.IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver;
    isTauriRuntime.mockReturnValue(true);
    loadSavedDictationAudio.mockResolvedValue({
      audioBytes: new Uint8Array([1, 2, 3]),
      mimeType: "audio/webm",
    });
    exportSavedDictationAudio.mockResolvedValue({
      savedPath: "C:\\Users\\nikhi\\Downloads\\Vaak\\discord-1.webm",
      fileName: "discord-1.webm",
    });
    appEnvironment.appEnv = "development";
    appEnvironment.exposeProcessedAudioArtifacts = true;
    sanitizeTargetControlName.mockImplementation(({ controlName, controlType }) =>
      controlName || controlType,
    );
  });

  it("renders a production activity overview with summary cards and feed rows", async () => {
    getRecentDictationRecords.mockResolvedValue([
      {
        schemaVersion: 1,
        recordId: "7f3e2c91-5b6a-4a23-9f8e-1b7d2a9c3e41",
        userId: "b4c8d2f0-2a71-4c8a-9bde-3f1a7e9b8c6d",
        installationId: "c2e9af6b-8d31-4e33-9d24-0f6e7c3b6a11",
        deviceId: "d1f6b2e9-3c47-4a1f-a2d1-9a3c6f7b8e22",
        sessionId: "e7d9a3c1-1f6b-4b2a-b8e9-6c3a5d7f9b44",
        mode: "dictation",
        trigger: "hotkey",
        platform: "windows",
        capturedAt: "2025-05-19T10:24:31Z",
        startedAt: null,
        endedAt: null,
        recording: {
          analysisMs: 18,
          insertionMs: 12,
          postProcessingMs: 940,
          startupMs: 42,
          streamAcquisitionMs: 18,
          reusedWarmStream: false,
          transcriptionMs: 910,
        },
        audio: {
          relativePath: "recordings/2025/05/19/discord-1.webm",
          mimeType: "audio/webm",
          byteLength: 2048,
        },
        processedAudio: {
          relativePath: "recordings/2025/05/19/discord-1-processed.wav",
          mimeType: "audio/wav",
          byteLength: 1536,
        },
        target: {
          stableId: "discord:messagebox:chat-input",
          windowTitle: "#product-launch - Discord",
          controlName: "Message Box",
          controlType: "Edit",
          controlTypeId: 50004,
          automationId: "chat-input",
          frameworkId: "WebView2",
          className: "Chrome_WidgetWin_1",
          nativeWindowHandle: 42,
          inputKind: "text",
          currentValue: null,
        },
        provider: {
          providerId: "openai",
          modelId: "gpt-4o-mini-transcribe",
        },
        transcript: {
          rawText: "Hey team, just a quick update on the launch plan",
          finalText: "Hey team, just a quick update on the launch plan",
          characterCount: 44,
        },
        insertion: {
          status: "inserted",
          method: "send_input",
          errorCode: null,
          errorMessage: null,
        },
      },
    ]);

    renderApp(<HomePanel />);

    await waitFor(() => {
      expect(screen.getByText("Voice Activity")).toBeInTheDocument();
    });

    expect(getRecentDictationRecords).toHaveBeenCalledWith(15, 0);
    expect(screen.queryByText("Activity overview")).not.toBeInTheDocument();
    expect(screen.queryByText("Recent records")).not.toBeInTheDocument();
    expect(screen.queryByText("Successful inserts")).not.toBeInTheDocument();
    expect(screen.queryByText("Primary target")).not.toBeInTheDocument();
    expect(screen.queryByText("Voice")).not.toBeInTheDocument();
    expect(screen.queryByText("Activity feed")).not.toBeInTheDocument();
    expect(screen.queryByText("Recent dictation activity")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "View full history" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Discord").length).toBeGreaterThan(0);
    expect(screen.getByText("Message Box")).toBeInTheDocument();
    expect(
      screen.queryByText("Post 940 ms · STT 910 ms · Analyze 18 ms · Insert 12 ms · Startup 42 ms"),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Inserted").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Play original audio for Discord" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Play processed audio for Discord" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Text input")).not.toBeInTheDocument();
    expect(screen.getByText("OpenAI · gpt-4o-mini-transcribe")).toBeInTheDocument();
    expect(screen.queryByText("Capture record")).not.toBeInTheDocument();
    expect(screen.queryByText("Versioned record")).not.toBeInTheDocument();
  });

  it("hides processed audio artifacts in production", async () => {
    appEnvironment.appEnv = "production";
    appEnvironment.exposeProcessedAudioArtifacts = false;
    getRecentDictationRecords.mockResolvedValue([
      makeRecord({
        recordId: "production-record",
        capturedAt: "2025-05-19T10:24:31Z",
        finalText: "Production transcript",
        processedAudio: {
          relativePath: "recordings/2025/05/19/processed.wav",
          mimeType: "audio/wav",
          byteLength: 1536,
        },
      }),
    ]);

    renderApp(<HomePanel />);

    await waitFor(() => {
      expect(screen.getByText("Production transcript")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", {
        name: "Play original audio for Windows Terminal",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Play processed audio for Windows Terminal",
      }),
    ).not.toBeInTheDocument();
  });

  it("shows a polished empty state when there is no persisted dictation history yet", async () => {
    getRecentDictationRecords.mockResolvedValue([]);

    renderApp(<HomePanel />);

    await waitFor(() => {
      expect(screen.getByText("Voice Activity")).toBeInTheDocument();
    });

    expect(
      screen.getByText("Recent activity will appear here"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Start dictation once and Vaak will keep a local-first trail of recent insertions, skips, and failures.",
      ),
    ).toBeInTheDocument();
  });

  it("centers the voice activity column without a fake top-bar offset", async () => {
    getRecentDictationRecords.mockResolvedValue([]);

    renderApp(<HomePanel />);

    const content = await screen.findByTestId("app-screen-content");
    const shell = await screen.findByTestId("voice-activity-shell");

    expect(content).not.toHaveClass(
      "pt-[4.05rem]",
      "sm:pt-[5.0625rem]",
      "lg:pt-[6.075rem]",
    );
    expect(content).toHaveClass("py-5", "lg:py-6");
    expect(shell).toHaveClass("mx-auto", "w-full", "max-w-[52rem]");
  });

  it("replaces editor accessibility placeholder text with a clean target label", async () => {
    sanitizeTargetControlName.mockImplementation(({ controlName, controlType }) =>
      /The editor is not accessible at this time/i.test(controlName)
        ? "Editor"
        : controlName || controlType,
    );
    getRecentDictationRecords.mockResolvedValue([
      {
        schemaVersion: 1,
        recordId: "e9b5f6ca-81e6-4405-b0d1-5bcf1ca92552",
        userId: "b4c8d2f0-2a71-4c8a-9bde-3f1a7e9b8c6d",
        installationId: "c2e9af6b-8d31-4e33-9d24-0f6e7c3b6a11",
        deviceId: "d1f6b2e9-3c47-4a1f-a2d1-9a3c6f7b8e22",
        sessionId: "e7d9a3c1-1f6b-4b2a-b8e9-6c3a5d7f9b44",
        mode: "dictation",
        trigger: "hotkey",
        platform: "windows",
        capturedAt: "2025-05-19T10:24:31Z",
        startedAt: null,
        endedAt: null,
        target: {
          stableId: "vscode:editor:active",
          windowTitle: "Visual Studio Code",
          controlName:
            "The editor is not accessible at this time. To enable screen reader optimized mode, use Shift+Alt+F1",
          controlType: "Document",
          controlTypeId: 50030,
          automationId: "editor",
          frameworkId: "Chrome",
          className: "Chrome_RenderWidgetHostHWND",
          nativeWindowHandle: 42,
          inputKind: "editor",
          currentValue: null,
        },
        provider: {
          providerId: "openai",
          modelId: "gpt-4o-mini-transcribe",
        },
        transcript: {
          rawText: "Refactor the focus capture flow",
          finalText: "Refactor the focus capture flow",
          characterCount: 31,
        },
        insertion: {
          status: "inserted",
          method: "send_input",
          errorCode: null,
          errorMessage: null,
        },
      },
    ]);

    renderApp(<HomePanel />);

    await waitFor(() => {
      expect(screen.getAllByText("Visual Studio Code").length).toBeGreaterThan(
        0,
      );
    });

    expect(screen.getAllByText("Editor").length).toBeGreaterThan(0);
    expect(sanitizeTargetControlName).toHaveBeenCalled();
    expect(
      screen.queryAllByText(/The editor is not accessible at this time/i),
    ).toHaveLength(0);
  });

  it("labels terminal activity from the target when the window title is custom", async () => {
    getRecentDictationRecords.mockResolvedValue([
      {
        schemaVersion: 1,
        recordId: "f1d1d160-2cc1-4ef3-a076-3f75efdb3f2d",
        userId: "b4c8d2f0-2a71-4c8a-9bde-3f1a7e9b8c6d",
        installationId: "c2e9af6b-8d31-4e33-9d24-0f6e7c3b6a11",
        deviceId: "d1f6b2e9-3c47-4a1f-a2d1-9a3c6f7b8e22",
        sessionId: "e7d9a3c1-1f6b-4b2a-b8e9-6c3a5d7f9b44",
        mode: "dictation",
        trigger: "hotkey",
        platform: "windows",
        capturedAt: "2025-05-19T10:24:31Z",
        startedAt: null,
        endedAt: null,
        target: {
          stableId: "terminal:powershell:custom-title",
          windowTitle: "vaak",
          controlName: "PowerShell",
          controlType: "Edit",
          controlTypeId: 50004,
          automationId: "terminal-input",
          frameworkId: "Console",
          className: "CASCADIA_HOSTING_WINDOW_CLASS",
          nativeWindowHandle: 42,
          inputKind: "terminal",
          currentValue: null,
        },
        provider: {
          providerId: "azure_openai",
          modelId: "gpt-4o-transcribe",
        },
        transcript: {
          rawText: "List the last 50 entries",
          finalText: "List the last 50 entries",
          characterCount: 24,
        },
        insertion: {
          status: "inserted",
          method: "send_input",
          errorCode: null,
          errorMessage: null,
        },
      },
    ]);

    renderApp(<HomePanel />);

    await waitFor(() => {
      expect(screen.getAllByText("PowerShell").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText(/^vaak$/i)).not.toBeInTheDocument();
  });

  it("does not repeat the same terminal label in both title and subtitle", async () => {
    getRecentDictationRecords.mockResolvedValue([
      {
        schemaVersion: 1,
        recordId: "f1d1d160-2cc1-4ef3-a076-3f75efdb3f2e",
        userId: "b4c8d2f0-2a71-4c8a-9bde-3f1a7e9b8c6d",
        installationId: "c2e9af6b-8d31-4e33-9d24-0f6e7c3b6a11",
        deviceId: "d1f6b2e9-3c47-4a1f-a2d1-9a3c6f7b8e22",
        sessionId: "e7d9a3c1-1f6b-4b2a-b8e9-6c3a5d7f9b44",
        mode: "dictation",
        trigger: "hotkey",
        platform: "windows",
        capturedAt: "2025-05-19T10:24:31Z",
        startedAt: null,
        endedAt: null,
        target: {
          stableId: "terminal:powershell:duplicate-label",
          windowTitle: "vaak",
          controlName: "PowerShell",
          controlType: "Edit",
          controlTypeId: 50004,
          automationId: "terminal-input",
          frameworkId: "Console",
          className: "CASCADIA_HOSTING_WINDOW_CLASS",
          nativeWindowHandle: 42,
          inputKind: "terminal",
          currentValue: null,
        },
        provider: {
          providerId: "azure_openai",
          modelId: "gpt-4o-transcribe",
        },
        transcript: {
          rawText: "List the last 50 entries",
          finalText: "List the last 50 entries",
          characterCount: 24,
        },
        insertion: {
          status: "inserted",
          method: "send_input",
          errorCode: null,
          errorMessage: null,
        },
      },
    ]);

    renderApp(<HomePanel />);

    await waitFor(() => {
      expect(screen.getByText("PowerShell")).toBeInTheDocument();
    });

    expect(screen.getAllByText("PowerShell")).toHaveLength(1);
  });

  it("shows 15 items first, keeps full counts, and appends more rows on scroll", async () => {
    const initialRecords = Array.from({ length: 15 }, (_, index) => makeRecord({
      recordId: `feed-record-${index + 1}`,
      capturedAt: `2025-05-19T10:${String(index).padStart(2, "0")}:31Z`,
      finalText: `Transcript ${index + 1}`,
    }));
    const appendedRecords = Array.from({ length: 5 }, (_, index) => makeRecord({
      recordId: `feed-record-${index + 16}`,
      capturedAt: `2025-05-19T11:${String(index).padStart(2, "0")}:31Z`,
      finalText: `Transcript ${index + 16}`,
    }));
    getRecentDictationRecords.mockImplementation((_limit: number, offset: number) =>
      Promise.resolve(offset === 15 ? appendedRecords : initialRecords),
    );

    renderApp(<HomePanel />);

    await waitFor(() => {
      expect(screen.getByText("15 inserted")).toBeInTheDocument();
    });

    expect(getRecentDictationRecords).toHaveBeenNthCalledWith(1, 15, 0);
    expect(screen.getByText("Showing 15 of 15 captures on this device")).toBeInTheDocument();
    expect(screen.getByText("Transcript 15")).toBeInTheDocument();
    expect(screen.queryByText("Transcript 16")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(observeSpy).toHaveBeenCalled();
    });

    intersectionObserverCallback?.([{ isIntersecting: true }]);

    await waitFor(() => {
      expect(getRecentDictationRecords).toHaveBeenCalledWith(15, 15);
      expect(screen.getByText("Transcript 16")).toBeInTheDocument();
    });

    expect(screen.getByText("Transcript 20")).toBeInTheDocument();
    expect(screen.getByText("Showing 20 of 20 captures on this device")).toBeInTheDocument();
    expect(screen.getByText("20 inserted")).toBeInTheDocument();
  });

  it("exports saved audio into a user-visible location when download is clicked", async () => {
    const user = userEvent.setup();
    getRecentDictationRecords.mockResolvedValue([
      {
        schemaVersion: 1,
        recordId: "7f3e2c91-5b6a-4a23-9f8e-1b7d2a9c3e41",
        userId: "b4c8d2f0-2a71-4c8a-9bde-3f1a7e9b8c6d",
        installationId: "c2e9af6b-8d31-4e33-9d24-0f6e7c3b6a11",
        deviceId: "d1f6b2e9-3c47-4a1f-a2d1-9a3c6f7b8e22",
        sessionId: "e7d9a3c1-1f6b-4b2a-b8e9-6c3a5d7f9b44",
        mode: "dictation",
        trigger: "hotkey",
        platform: "windows",
        capturedAt: "2025-05-19T10:24:31Z",
        startedAt: null,
        endedAt: null,
        audio: {
          relativePath: "recordings/2025/05/19/discord-1.webm",
          mimeType: "audio/webm",
          byteLength: 2048,
        },
        processedAudio: null,
        target: {
          stableId: "discord:messagebox:chat-input",
          windowTitle: "#product-launch - Discord",
          controlName: "Message Box",
          controlType: "Edit",
          controlTypeId: 50004,
          automationId: "chat-input",
          frameworkId: "WebView2",
          className: "Chrome_WidgetWin_1",
          nativeWindowHandle: 42,
          inputKind: "text",
          currentValue: null,
        },
        provider: {
          providerId: "openai",
          modelId: "gpt-4o-mini-transcribe",
        },
        transcript: {
          rawText: "Hey team, just a quick update on the launch plan",
          finalText: "Hey team, just a quick update on the launch plan",
          characterCount: 44,
        },
        insertion: {
          status: "inserted",
          method: "send_input",
          errorCode: null,
          errorMessage: null,
        },
      },
    ]);

    renderApp(<HomePanel />);

    await user.click(
      await screen.findByRole("button", { name: "Play original audio for Discord" }),
    );
    await user.click(await screen.findByRole("button", { name: "Download audio" }));

    expect(exportSavedDictationAudio).toHaveBeenCalledWith(
      "recordings/2025/05/19/discord-1.webm",
    );
    expect(revealItemInDir).toHaveBeenCalledWith(
      "C:\\Users\\nikhi\\Downloads\\Vaak\\discord-1.webm",
    );
  });
});

function makeRecord({
  recordId,
  capturedAt,
  finalText,
  processedAudio = null,
}: {
  recordId: string;
  capturedAt: string;
  finalText: string;
  processedAudio?: unknown;
}) {
  return {
    schemaVersion: 1,
    recordId,
    userId: "b4c8d2f0-2a71-4c8a-9bde-3f1a7e9b8c6d",
    installationId: "c2e9af6b-8d31-4e33-9d24-0f6e7c3b6a11",
    deviceId: "d1f6b2e9-3c47-4a1f-a2d1-9a3c6f7b8e22",
    sessionId: "e7d9a3c1-1f6b-4b2a-b8e9-6c3a5d7f9b44",
    mode: "dictation",
    trigger: "hotkey",
    platform: "windows",
    capturedAt,
    startedAt: null,
    endedAt: null,
    audio: {
      relativePath: `recordings/2025/05/19/${recordId}.webm`,
      mimeType: "audio/webm",
      byteLength: 2048,
    },
    processedAudio,
    target: {
      stableId: `powershell:${recordId}`,
      windowTitle: "PowerShell",
      controlName: "Terminal Input",
      controlType: "Edit",
      controlTypeId: 50004,
      automationId: "terminal-input",
      frameworkId: "Console",
      className: "CASCADIA_HOSTING_WINDOW_CLASS",
      nativeWindowHandle: 42,
      inputKind: "terminal",
      currentValue: null,
    },
    provider: {
      providerId: "azure_openai",
      modelId: "gpt-4o-transcribe",
    },
    transcript: {
      rawText: finalText,
      finalText,
      characterCount: finalText.length,
    },
    insertion: {
      status: "inserted",
      method: "send_input",
      errorCode: null,
      errorMessage: null,
    },
  };
}
