import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderApp } from "@/test/render";

import { HomePanel } from "./HomePanel";

const { analyzeAudioForRetry } = vi.hoisted(() => ({
  analyzeAudioForRetry: vi.fn(),
}));

vi.mock("./retryAudioProcessing", () => ({
  analyzeAudioForRetry,
}));

const {
  getAllRecentDictationRecords,
  getRecentDictationRecords,
  getSystemSettings,
  persistDictationAudio,
  saveDictationRecord,
  updateDictationRecord,
  transcribeRecording,
  exportSavedDictationAudio,
  isTauriRuntime,
  loadSavedDictationAudio,
  sanitizeTargetControlName,
} = vi.hoisted(() => ({
  getAllRecentDictationRecords: vi.fn(),
  getRecentDictationRecords: vi.fn(),
  getSystemSettings: vi.fn(),
  persistDictationAudio: vi.fn(),
  saveDictationRecord: vi.fn(),
  updateDictationRecord: vi.fn(),
  transcribeRecording: vi.fn(),
  exportSavedDictationAudio: vi.fn(),
  isTauriRuntime: vi.fn(),
  loadSavedDictationAudio: vi.fn(),
  sanitizeTargetControlName: vi.fn(),
}));

vi.mock("@/lib/tauri", () => ({
  exportSavedDictationAudio,
  getAllRecentDictationRecords,
  getRecentDictationRecords,
  getSystemSettings,
  persistDictationAudio,
  saveDictationRecord,
  updateDictationRecord,
  transcribeRecording,
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
  let playSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    playSpy = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    pauseSpy = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => undefined);
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
    getAllRecentDictationRecords.mockResolvedValue([]);
    getSystemSettings.mockResolvedValue({
      launchOnStartup: true,
      showSkippedTranscripts: false,
    });
    loadSavedDictationAudio.mockResolvedValue({
      audioBytes: new Uint8Array([1, 2, 3]),
      mimeType: "audio/webm",
    });
    analyzeAudioForRetry.mockResolvedValue({
      processedAudio: null,
      transcriptionSegments: [],
    });
    transcribeRecording.mockResolvedValue({
      providerId: "smallest",
      model: "pulse",
      text: "Recovered transcript",
      durationMs: 900,
    });
    persistDictationAudio.mockResolvedValue({
      relativePath: "recordings/2025/05/19/retry-processed.wav",
      mimeType: "audio/wav",
      byteLength: 4096,
    });
    saveDictationRecord.mockImplementation((draft) =>
      Promise.resolve({
        ...draft,
        schemaVersion: 1,
        recordId: "retry-record",
        userId: "user-1",
        installationId: "install-1",
        deviceId: "device-1",
        sessionId: "session-1",
        platform: "windows",
      }),
    );
    updateDictationRecord.mockImplementation((recordId, patch) =>
      Promise.resolve({
        ...makeRecord({
          recordId,
          capturedAt: "2025-05-19T10:23:31Z",
          finalText: patch.transcript.finalText,
          insertionStatus: patch.insertion.status,
          processedAudio: patch.processedAudio ?? null,
        }),
        provider: patch.provider,
        recording: patch.recording,
        transcript: patch.transcript,
        insertion: patch.insertion,
      }),
    );
    exportSavedDictationAudio.mockResolvedValue({
      savedPath: "C:\\Users\\nikhi\\Downloads\\Vaak\\discord-1.webm",
      fileName: "discord-1.webm",
    });
    appEnvironment.appEnv = "development";
    appEnvironment.enableDebugUi = false;
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
    expect(getAllRecentDictationRecords).toHaveBeenCalled();
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
    expect(screen.queryByText("Message Box")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Post 940 ms · STT 910 ms · Analyze 18 ms · Insert 12 ms · Startup 42 ms"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^Inserted$/)).not.toBeInTheDocument();
    const metadata = screen.getByTestId(
      "activity-metadata-7f3e2c91-5b6a-4a23-9f8e-1b7d2a9c3e41",
    );
    expect(metadata).not.toHaveClass("border-t");
    expect(
      screen.getByRole("button", { name: "Play audio for Discord" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Play original audio for Discord" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Play processed audio for Discord" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Original")).not.toBeInTheDocument();
    expect(screen.queryByText("Processed")).not.toBeInTheDocument();
    expect(screen.queryByText("Text input")).not.toBeInTheDocument();
    expect(screen.getByText("OpenAI · gpt-4o-mini-transcribe")).toBeInTheDocument();
    expect(screen.queryByText("Capture record")).not.toBeInTheDocument();
    expect(screen.queryByText("Versioned record")).not.toBeInTheDocument();
  });

  it("calculates the top productivity hero from all local records, not only visible feed rows", async () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    getRecentDictationRecords.mockResolvedValue([
      makeRecord({
        recordId: "visible-record",
        capturedAt: today.toISOString(),
        finalText: "Visible feed transcript",
      }),
    ]);
    getAllRecentDictationRecords.mockResolvedValue([
      makeRecord({
        recordId: "stats-record-1",
        capturedAt: today.toISOString(),
        finalText: "First full history productivity transcript",
      }),
      makeRecord({
        recordId: "stats-record-2",
        capturedAt: yesterday.toISOString(),
        finalText: "Second full history productivity transcript",
      }),
    ]);

    renderApp(<HomePanel />);

    expect(await screen.findByText("2 active days")).toBeInTheDocument();
    expect(screen.getByText("1 inserted")).toBeInTheDocument();
  });

  it("keeps inserted rows quiet while showing fresh time copy", async () => {
    getRecentDictationRecords.mockResolvedValue([
      makeRecord({
        recordId: "current-inserted-record",
        capturedAt: new Date().toISOString(),
        finalText: "Recent inserted transcript",
      }),
    ]);

    renderApp(<HomePanel />);

    await waitFor(() => {
      expect(screen.getByText("Voice Activity")).toBeInTheDocument();
    });

    expect(screen.queryByText(/^Inserted$/)).not.toBeInTheDocument();
    expect(screen.getByText("Just now")).toBeInTheDocument();
    expect(screen.queryByText("this minute")).not.toBeInTheDocument();
  });

  it("hides skipped activity rows by default while keeping failed rows visible", async () => {
    getRecentDictationRecords.mockResolvedValue([
      makeRecord({
        recordId: "inserted-record",
        capturedAt: "2025-05-19T10:25:31Z",
        finalText: "Inserted transcript",
      }),
      makeRecord({
        recordId: "skipped-record",
        capturedAt: "2025-05-19T10:24:31Z",
        finalText: "Skipped transcript",
        insertionStatus: "skipped",
      }),
      makeRecord({
        recordId: "failed-record",
        capturedAt: "2025-05-19T10:23:31Z",
        finalText: "Failed transcript",
        insertionStatus: "failed",
      }),
    ]);

    renderApp(<HomePanel />);

    await waitFor(() => {
      expect(screen.getByText("Voice Activity")).toBeInTheDocument();
    });

    expect(screen.queryByText(/^Skipped$/)).not.toBeInTheDocument();
    expect(screen.queryByText("Skipped transcript")).not.toBeInTheDocument();
    expect(screen.queryByText("0 skipped")).not.toBeInTheDocument();
    expect(screen.getByText("1 inserted")).toBeInTheDocument();
    expect(screen.getByText(/^Failed$/)).toBeInTheDocument();
  });

  it("shows skipped activity rows when the application setting is enabled", async () => {
    getSystemSettings.mockResolvedValue({
      launchOnStartup: true,
      showSkippedTranscripts: true,
    });
    getRecentDictationRecords.mockResolvedValue([
      makeRecord({
        recordId: "skipped-record",
        capturedAt: "2025-05-19T10:24:31Z",
        finalText: "Skipped transcript",
        insertionStatus: "skipped",
      }),
    ]);

    renderApp(<HomePanel />);

    await waitFor(() => {
      expect(screen.getByText("Voice Activity")).toBeInTheDocument();
    });

    expect(screen.getByText(/^Skipped$/)).toBeInTheDocument();
    expect(screen.getByText("1 skipped")).toBeInTheDocument();
    expect(screen.getByText("Skipped transcript")).toBeInTheDocument();
  });

  it("updates the failed activity row when retry recovers transcript text", async () => {
    const user = userEvent.setup();
    getRecentDictationRecords.mockResolvedValue([
      makeRecord({
        recordId: "failed-record",
        capturedAt: "2025-05-19T10:23:31Z",
        finalText: "",
        insertionStatus: "failed",
      }),
    ]);

    renderApp(<HomePanel />);

    await user.click(
      await screen.findByRole("button", {
        name: "Retry transcription for Windows Terminal",
      }),
    );

    await waitFor(() => {
      expect(loadSavedDictationAudio).toHaveBeenCalledWith(
        "recordings/2025/05/19/failed-record.webm",
      );
      expect(transcribeRecording).toHaveBeenCalledWith({
        providerId: "azure-openai",
        audioBlob: expect.any(Blob),
        language: "en",
        model: "gpt-4o-transcribe",
      });
      expect(updateDictationRecord).toHaveBeenCalledWith("failed-record", {
        recording: expect.any(Object),
        processedAudio: null,
        insertion: {
          errorCode: null,
          errorMessage: null,
          method: null,
          status: "recovered",
        },
        provider: {
          providerId: "smallest",
          modelId: "pulse",
        },
        transcript: {
          rawText: "Recovered transcript",
          finalText: "Recovered transcript",
          characterCount: 20,
        },
      });
    });
    expect(saveDictationRecord).not.toHaveBeenCalled();
    expect(await screen.findByText("Recovered transcript")).toBeInTheDocument();
    expect(screen.getByText(/^Recovered$/)).toBeInTheDocument();
    expect(screen.queryByText(/^Skipped$/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Retry transcription for Windows Terminal",
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps the failed row and shows an inline error when retry provider fails", async () => {
    const user = userEvent.setup();
    transcribeRecording.mockRejectedValueOnce(new Error("provider unavailable"));
    getRecentDictationRecords.mockResolvedValue([
      makeRecord({
        recordId: "failed-provider-error-record",
        capturedAt: "2025-05-19T10:23:31Z",
        finalText: "",
        insertionStatus: "failed",
      }),
    ]);

    renderApp(<HomePanel />);

    await user.click(
      await screen.findByRole("button", {
        name: "Retry transcription for Windows Terminal",
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Retry failed: provider unavailable",
      );
    });
    expect(updateDictationRecord).not.toHaveBeenCalled();
    expect(saveDictationRecord).not.toHaveBeenCalled();
    expect(screen.getByText(/^Failed$/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Retry transcription for Windows Terminal",
      }),
    ).toBeInTheDocument();
  });

  it("does not reuse stale processed audio when retrying failed records", async () => {
    const user = userEvent.setup();
    loadSavedDictationAudio.mockResolvedValue({
      audioBytes: new Uint8Array([1, 2, 3, 4]),
      mimeType: "audio/webm",
    });
    transcribeRecording.mockImplementation(async ({ audioBlob }) => {
      expect(audioBlob).toBeInstanceOf(Blob);
      expect(audioBlob.type).toBe("audio/webm");
      return {
        providerId: "smallest",
        model: "pulse",
        text: "Recovered from original fallback",
        durationMs: 900,
      };
    });
    getRecentDictationRecords.mockResolvedValue([
      makeRecord({
        recordId: "failed-record-with-processed-audio",
        capturedAt: "2025-05-19T10:23:31Z",
        finalText: "",
        insertionStatus: "failed",
        processedAudio: {
          relativePath: "recordings/2025/05/19/failed-record-with-processed-audio.wav",
          mimeType: "audio/wav",
          byteLength: 4096,
        },
      }),
    ]);

    renderApp(<HomePanel />);

    await user.click(
      await screen.findByRole("button", {
        name: "Retry transcription for Windows Terminal",
      }),
    );

    await waitFor(() => {
      expect(loadSavedDictationAudio).toHaveBeenCalledWith(
        "recordings/2025/05/19/failed-record-with-processed-audio.webm",
      );
      expect(transcribeRecording).toHaveBeenCalledWith({
        providerId: "azure-openai",
        audioBlob: expect.any(Blob),
        language: "en",
        model: "gpt-4o-transcribe",
      });
    });
  });

  it("reprocesses original audio into transcription segments before retrying", async () => {
    const user = userEvent.setup();
    const firstSegment = new Blob(["first"], { type: "audio/wav" });
    const secondSegment = new Blob(["second"], { type: "audio/wav" });
    analyzeAudioForRetry.mockResolvedValue({
      processedAudio: new Blob(["processed"], { type: "audio/wav" }),
      transcriptionSegments: [firstSegment, secondSegment],
    });
    transcribeRecording
      .mockResolvedValueOnce({
        providerId: "smallest",
        model: "pulse",
        text: "First segment",
        durationMs: 700,
      })
      .mockResolvedValueOnce({
        providerId: "smallest",
        model: "pulse",
        text: "second segment",
        durationMs: 800,
      });
    getRecentDictationRecords.mockResolvedValue([
      makeRecord({
        recordId: "failed-record-needs-reprocessing",
        capturedAt: "2025-05-19T10:23:31Z",
        finalText: "",
        insertionStatus: "failed",
      }),
    ]);

    renderApp(<HomePanel />);

    await user.click(
      await screen.findByRole("button", {
        name: "Retry transcription for Windows Terminal",
      }),
    );

    await waitFor(() => {
      expect(analyzeAudioForRetry).toHaveBeenCalledWith(expect.any(Blob));
      expect(transcribeRecording).toHaveBeenCalledTimes(2);
      expect(transcribeRecording).toHaveBeenNthCalledWith(1, {
        providerId: "azure-openai",
        audioBlob: firstSegment,
        language: "en",
        model: "gpt-4o-transcribe",
      });
      expect(transcribeRecording).toHaveBeenNthCalledWith(2, {
        providerId: "azure-openai",
        audioBlob: secondSegment,
        language: "en",
        model: "gpt-4o-transcribe",
      });
      expect(updateDictationRecord).toHaveBeenCalledWith(
        "failed-record-needs-reprocessing",
        expect.objectContaining({
          transcript: {
            rawText: "First segment second segment",
            finalText: "First segment second segment",
            characterCount: 28,
          },
          processedAudio: {
            relativePath: "recordings/2025/05/19/retry-processed.wav",
            mimeType: "audio/wav",
            byteLength: 4096,
          },
        }),
      );
    });
  });

  it("falls back to the full processed retry audio when segments return empty provider responses", async () => {
    const user = userEvent.setup();
    const firstSegment = new Blob(["first"], { type: "audio/wav" });
    const secondSegment = new Blob(["second"], { type: "audio/wav" });
    const fullProcessedAudio = new Blob(["processed-full"], { type: "audio/wav" });
    analyzeAudioForRetry.mockResolvedValue({
      processedAudio: fullProcessedAudio,
      transcriptionSegments: [firstSegment, secondSegment],
    });
    transcribeRecording
      .mockRejectedValueOnce({
        code: "invalid_provider_response",
        message: "provider returned an invalid response",
      })
      .mockRejectedValueOnce({
        code: "invalid_provider_response",
        message: "provider returned an invalid response",
      })
      .mockResolvedValueOnce({
        providerId: "smallest",
        model: "pulse",
        text: "Recovered from full processed audio",
        durationMs: 1200,
      });
    getRecentDictationRecords.mockResolvedValue([
      makeRecord({
        recordId: "failed-record-empty-segments",
        capturedAt: "2025-05-19T10:23:31Z",
        finalText: "",
        insertionStatus: "failed",
      }),
    ]);

    renderApp(<HomePanel />);

    await user.click(
      await screen.findByRole("button", {
        name: "Retry transcription for Windows Terminal",
      }),
    );

    await waitFor(() => {
      expect(transcribeRecording).toHaveBeenCalledTimes(3);
      expect(transcribeRecording).toHaveBeenNthCalledWith(3, {
        providerId: "azure-openai",
        audioBlob: fullProcessedAudio,
        language: "en",
        model: "gpt-4o-transcribe",
      });
      expect(updateDictationRecord).toHaveBeenCalledWith(
        "failed-record-empty-segments",
        expect.objectContaining({
          transcript: {
            rawText: "Recovered from full processed audio",
            finalText: "Recovered from full processed audio",
            characterCount: 35,
          },
        }),
      );
    });
  });

  it("hides processed audio artifacts in production", async () => {
    appEnvironment.appEnv = "production";
    appEnvironment.enableDebugUi = false;
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
        name: "Play audio for Windows Terminal",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Play processed audio for Windows Terminal",
      }),
    ).not.toBeInTheDocument();
  });

  it("shows processed audio playback only in dev debug UI", async () => {
    appEnvironment.enableDebugUi = true;
    appEnvironment.exposeProcessedAudioArtifacts = true;
    getRecentDictationRecords.mockResolvedValue([
      makeRecord({
        recordId: "debug-processed-record",
        capturedAt: "2025-05-19T10:24:31Z",
        finalText: "Debug processed audio transcript",
        processedAudio: {
          relativePath: "recordings/2025/05/19/debug-processed.wav",
          mimeType: "audio/wav",
          byteLength: 1536,
        },
      }),
    ]);

    renderApp(<HomePanel />);

    await waitFor(() => {
      expect(screen.getByText("Debug processed audio transcript")).toBeInTheDocument();
    });

    const metadata = screen.getByTestId("activity-metadata-debug-processed-record");
    expect(metadata).not.toHaveClass("border-t");
    expect(
      screen.getByRole("button", {
        name: "Play audio for Windows Terminal",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Play processed audio for Windows Terminal",
      }),
    ).toHaveTextContent("Processed");
  });

  it("clamps long transcripts and lets the user expand them", async () => {
    const user = userEvent.setup();
    const longTranscript =
      "This is a longer dictated message that should stay compact in the activity feed until the user chooses to read the full transcript. It keeps the row easier to scan while preserving access to the complete captured text. The transcript area should wrap naturally inside the card instead of clipping off the right edge of the window or forcing the audio controls out of view.";
    getRecentDictationRecords.mockResolvedValue([
      makeRecord({
        recordId: "long-transcript-record",
        capturedAt: "2025-05-19T10:24:31Z",
        finalText: longTranscript,
      }),
    ]);

    renderApp(<HomePanel />);

    const transcript = await screen.findByTestId(
      "activity-transcript-long-transcript-record",
    );
    expect(transcript).toHaveClass(
      "line-clamp-3",
      "text-foreground/72",
      "break-words",
      "[overflow-wrap:anywhere]",
    );

    const expandButton = screen.getByRole("button", {
      name: "Expand transcript for Windows Terminal",
    });
    expect(expandButton).toHaveTextContent("Show more");
    expect(expandButton).not.toHaveTextContent(/^More$/);
    await user.click(expandButton);

    expect(transcript).not.toHaveClass("line-clamp-3");
    expect(
      screen.getByRole("button", {
        name: "Collapse transcript for Windows Terminal",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Collapse transcript for Windows Terminal",
      }),
    ).toHaveTextContent("Show less");
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

  it("shows a storage error instead of the empty state when activity loading fails", async () => {
    getRecentDictationRecords.mockRejectedValue(
      new Error(
        "settings_store_failed: dictation records database schema version 4 is newer than supported version 1",
      ),
    );

    renderApp(<HomePanel />);

    expect(await screen.findByText("Activity unavailable")).toBeInTheDocument();
    expect(
      screen.getByText(
        "settings_store_failed: dictation records database schema version 4 is newer than supported version 1",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Recent activity will appear here"),
    ).not.toBeInTheDocument();
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
    expect(shell).toHaveClass("w-full");
    expect(shell).not.toHaveClass("max-w-[56rem]");
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

    expect(screen.queryByText("Editor")).not.toBeInTheDocument();
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

    expect(screen.getByText("PowerShell")).toBeInTheDocument();
    expect(screen.getAllByText("PowerShell")).toHaveLength(1);
    expect(screen.queryByText("Terminal Input")).not.toBeInTheDocument();
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

  it("loads audio from the compact play button without opening an inline audio bar", async () => {
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
      await screen.findByRole("button", { name: "Play audio for Discord" }),
    );

    expect(loadSavedDictationAudio).toHaveBeenCalledWith(
      "recordings/2025/05/19/discord-1.webm",
    );
    expect(playSpy).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Download audio" })).not.toBeInTheDocument();
    expect(exportSavedDictationAudio).not.toHaveBeenCalled();
    expect(revealItemInDir).not.toHaveBeenCalled();
    expect(pauseSpy).not.toHaveBeenCalled();
  });
});

function makeRecord({
  recordId,
  capturedAt,
  finalText,
  processedAudio = null,
  insertionStatus = "inserted",
}: {
  recordId: string;
  capturedAt: string;
  finalText: string;
  processedAudio?: unknown;
  insertionStatus?: "inserted" | "skipped" | "failed";
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
      status: insertionStatus,
      method: "send_input",
      errorCode: null,
      errorMessage: null,
    },
  };
}
