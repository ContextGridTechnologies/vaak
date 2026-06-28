import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDictationLoop, type DictationLoopSession } from "./useDictationLoop";

const {
  getSelectedSpeechProvider,
  getSystemSettings,
  insertIntoActiveTarget,
  listenToTauriEvent,
  persistDictationAudio,
  recordStartupCheckpoint,
  saveDictationRecord,
  targetSnapshotFromFocusedField,
  transcribeRecording,
} = vi.hoisted(() => ({
  getSelectedSpeechProvider: vi.fn(),
  getSystemSettings: vi.fn(),
  insertIntoActiveTarget: vi.fn(),
  listenToTauriEvent: vi.fn(),
  persistDictationAudio: vi.fn(),
  recordStartupCheckpoint: vi.fn(),
  saveDictationRecord: vi.fn(),
  targetSnapshotFromFocusedField: vi.fn(),
  transcribeRecording: vi.fn(),
}));

vi.mock("@/lib/tauri", () => ({
  SPEECH_PROVIDER_CHANGED_EVENT: "vaak://speech-provider-changed",
  SYSTEM_SETTINGS_CHANGED_EVENT: "vaak://system-settings-changed",
  getSelectedSpeechProvider,
  getSystemSettings,
  insertIntoActiveTarget,
  listenToTauriEvent,
  persistDictationAudio,
  recordStartupCheckpoint,
  saveDictationRecord,
  targetSnapshotFromFocusedField,
  transcribeRecording,
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

function session(overrides: Partial<DictationLoopSession> = {}) {
  return {
    dictationTrigger: "hotkey",
    completedMode: "dictation",
    audioBlob: null,
    focusedField: {
      automationId: "message-input",
      className: "Chrome_WidgetWin_1",
      controlName: "Message",
      controlType: "Edit",
      controlTypeId: 50004,
      currentValue: "",
      frameworkId: "Win32",
      nativeWindowHandle: 42,
      stableId: "window:42/control:message-input",
      windowTitle: "Discord",
    },
    focusedFieldError: null,
    isRecording: false,
    recordingMetrics: {
      reusedWarmStream: true,
      startupMs: 24,
      streamAcquisitionMs: 0,
    },
    recordingEndedAt: "2026-05-02T08:30:04.000Z",
    recordingStartedAt: "2026-05-02T08:30:01.000Z",
    recorderError: null,
    ...overrides,
  } satisfies DictationLoopSession;
}

function analyzedSession(
  overrides: Partial<DictationLoopSession> & Record<string, unknown> = {},
) {
  return {
    ...session(overrides),
    captureAnalysis: {
      disposition: "ready",
      reason: null,
      metrics: {
        voicedMs: 900,
        leadingTrimMs: 120,
        trailingTrimMs: 180,
        longestPauseMs: 0,
        estimatedSnrDb: 16,
        averageDbfs: -20,
        peakDbfs: -8,
      },
      processedAudio: new Blob(["processed"], { type: "audio/wav" }),
      transcriptionSegments: [recordingBlob()],
    },
    ...overrides,
  } as DictationLoopSession;
}

function recordingBlob() {
  return new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
}

function StrictModeWrapper({ children }: { children: ReactNode }) {
  return createElement(StrictMode, null, children);
}

describe("useDictationLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSelectedSpeechProvider.mockResolvedValue("openai");
    getSystemSettings.mockResolvedValue({
      dictationMode: "streaming",
      launchOnStartup: true,
      showSkippedTranscripts: false,
    });
    insertIntoActiveTarget.mockResolvedValue({
      characters: 5,
      method: "send_input",
    });
    listenToTauriEvent.mockResolvedValue(() => {});
    persistDictationAudio.mockResolvedValue({
      relativePath: "recordings/2026/05/02/recording.webm",
      mimeType: "audio/webm",
      byteLength: 3,
    });
    recordStartupCheckpoint.mockResolvedValue(undefined);
    saveDictationRecord.mockResolvedValue(undefined);
    targetSnapshotFromFocusedField.mockImplementation((field) => ({
      stableId: field.stableId,
      windowTitle: field.windowTitle,
      controlName: field.controlName,
      controlType: field.controlType,
      controlTypeId: field.controlTypeId,
      automationId: field.automationId,
      frameworkId: field.frameworkId,
      className: field.className,
      nativeWindowHandle: field.nativeWindowHandle,
      inputKind: "text",
      currentValue: null,
    }));
    transcribeRecording.mockResolvedValue({
      durationMs: 1200,
      model: "gpt-4o-mini-transcribe",
      providerRequestStartedAt: "2026-05-02T08:30:04.100Z",
      providerResponseReceivedAt: "2026-05-02T08:30:05.300Z",
      providerId: "openai",
      text: "hello",
    });
    appEnvironment.appEnv = "development";
    appEnvironment.exposeProcessedAudioArtifacts = true;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("transcribes a stopped audio blob exactly once", async () => {
    const audioBlob = recordingBlob();
    transcribeRecording.mockResolvedValue({
      durationMs: 1200,
      model: "gpt-4o-mini-transcribe",
      providerId: "openai",
      text: "",
    });

    const { rerender } = renderHook(
      ({ value }) => useDictationLoop(value),
      { initialProps: { value: session({ audioBlob }) } },
    );

    await waitFor(() => expect(transcribeRecording).toHaveBeenCalledTimes(1));

    rerender({ value: session({ audioBlob }) });
    await act(async () => {
      await Promise.resolve();
    });

    expect(transcribeRecording).toHaveBeenCalledTimes(1);
    expect(transcribeRecording).toHaveBeenCalledWith({
      providerId: "openai",
      audioBlob,
      language: "en",
    });
  });

  it("does not retranscribe the same audio blob when the provider changes later", async () => {
    const audioBlob = recordingBlob();
    let providerChanged:
      | ((event: { payload: "azure-openai" }) => void | Promise<void>)
      | null = null;
    listenToTauriEvent.mockImplementation(async (_event, handler) => {
      providerChanged = handler;
      return () => {};
    });
    transcribeRecording.mockResolvedValue({
      durationMs: 1200,
      model: "gpt-4o-mini-transcribe",
      providerId: "openai",
      text: "",
    });

    renderHook(() => useDictationLoop(session({ audioBlob })));

    await waitFor(() => expect(transcribeRecording).toHaveBeenCalledTimes(1));
    await act(async () => {
      await providerChanged?.({ payload: "azure-openai" });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(transcribeRecording).toHaveBeenCalledTimes(1);
  });

  it("does not cancel insertion when the same recording is represented by a new Blob object", async () => {
    const firstAudioBlob = recordingBlob();
    const sameRecordingBlob = recordingBlob();
    let resolveTranscription:
      | ((value: Awaited<ReturnType<typeof transcribeRecording>>) => void)
      | undefined;
    transcribeRecording.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTranscription = resolve;
        }),
    );

    const { result, rerender } = renderHook(
      ({ value }) => useDictationLoop(value),
      { initialProps: { value: session({ audioBlob: firstAudioBlob }) } },
    );

    await waitFor(() => expect(transcribeRecording).toHaveBeenCalledTimes(1));

    rerender({ value: session({ audioBlob: sameRecordingBlob }) });
    await act(async () => {
      resolveTranscription?.({
        durationMs: 1200,
        model: "gpt-4o-mini-transcribe",
        providerId: "openai",
        text: "stable recording",
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(insertIntoActiveTarget).toHaveBeenCalledWith("stable recording");
    });
    expect(transcribeRecording).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("inserted");
  });

  it("continues insertion after React StrictMode re-runs mount effects", async () => {
    const audioBlob = recordingBlob();
    let resolveTranscription:
      | ((value: Awaited<ReturnType<typeof transcribeRecording>>) => void)
      | undefined;
    transcribeRecording.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTranscription = resolve;
        }),
    );

    renderHook(() => useDictationLoop(session({ audioBlob })), {
      wrapper: StrictModeWrapper,
    });

    await waitFor(() => expect(transcribeRecording).toHaveBeenCalledTimes(1));
    await act(async () => {
      resolveTranscription?.({
        durationMs: 1200,
        model: "gpt-4o-mini-transcribe",
        providerId: "openai",
        text: "strict mode text",
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(insertIntoActiveTarget).toHaveBeenCalledWith("strict mode text");
    });
  });

  it("does not persist a stale transcription failure after a newer recording starts", async () => {
    const firstAudioBlob = recordingBlob();
    const secondAudioBlob = new Blob([new Uint8Array([4, 5, 6])], {
      type: "audio/webm",
    });
    let rejectFirstTranscription:
      | ((reason?: unknown) => void)
      | undefined;
    transcribeRecording
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectFirstTranscription = reject;
          }),
      )
      .mockResolvedValueOnce({
        durationMs: 1200,
        model: "gpt-4o-mini-transcribe",
        providerId: "openai",
        text: "new recording",
      });

    const { rerender } = renderHook(
      ({ value }) => useDictationLoop(value),
      { initialProps: { value: session({ audioBlob: firstAudioBlob }) } },
    );

    await waitFor(() => expect(transcribeRecording).toHaveBeenCalledTimes(1));
    rerender({
      value: session({
        audioBlob: secondAudioBlob,
        recordingEndedAt: "2026-05-02T08:30:08.000Z",
        recordingStartedAt: "2026-05-02T08:30:05.000Z",
      }),
    });
    await waitFor(() => expect(transcribeRecording).toHaveBeenCalledTimes(2));

    await act(async () => {
      rejectFirstTranscription?.(new Error("provider timeout"));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(saveDictationRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          transcript: {
            characterCount: 13,
            finalText: "new recording",
            rawText: "new recording",
          },
        }),
      );
    });
    expect(saveDictationRecord).not.toHaveBeenCalledWith(
      expect.objectContaining({
        insertion: expect.objectContaining({
          errorCode: "transcription_failed",
        }),
      }),
    );
  });

  it("does not insert a completed transcription after a new recording has started", async () => {
    const audioBlob = recordingBlob();
    let resolveTranscription:
      | ((value: Awaited<ReturnType<typeof transcribeRecording>>) => void)
      | undefined;
    transcribeRecording.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTranscription = resolve;
        }),
    );

    const { result, rerender } = renderHook(
      ({ value }) => useDictationLoop(value),
      { initialProps: { value: session({ audioBlob }) } },
    );

    await waitFor(() => expect(transcribeRecording).toHaveBeenCalledTimes(1));
    rerender({
      value: session({
        audioBlob,
        isRecording: true,
      }),
    });

    await act(async () => {
      resolveTranscription?.({
        durationMs: 1200,
        model: "gpt-4o-mini-transcribe",
        providerId: "openai",
        text: "old recording",
      });
      await Promise.resolve();
    });

    expect(insertIntoActiveTarget).not.toHaveBeenCalled();
    expect(result.current.state).toBe("recording");
  });

  it("does not insert a completed transcription after processing is disabled", async () => {
    const audioBlob = recordingBlob();
    let resolveTranscription:
      | ((value: Awaited<ReturnType<typeof transcribeRecording>>) => void)
      | undefined;
    transcribeRecording.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTranscription = resolve;
        }),
    );

    const { result, rerender } = renderHook(
      ({ value }) => useDictationLoop(value),
      { initialProps: { value: session({ audioBlob }) } },
    );

    await waitFor(() => expect(transcribeRecording).toHaveBeenCalledTimes(1));
    rerender({
      value: session({
        audioBlob,
        processingEnabled: false,
      }),
    });

    await act(async () => {
      resolveTranscription?.({
        durationMs: 1200,
        model: "gpt-4o-mini-transcribe",
        providerId: "openai",
        text: "disabled recording",
      });
      await Promise.resolve();
    });

    expect(insertIntoActiveTarget).not.toHaveBeenCalled();
    expect(result.current.state).not.toBe("inserted");
  });

  it("does not mark an empty transcription inserted after processing is disabled", async () => {
    const audioBlob = recordingBlob();
    let resolveDraftSave: (() => void) | undefined;
    transcribeRecording.mockResolvedValueOnce({
      durationMs: 1200,
      model: "gpt-4o-mini-transcribe",
      providerId: "openai",
      text: "",
    });
    saveDictationRecord.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveDraftSave = resolve;
      }),
    );

    const { result, rerender } = renderHook(
      ({ value }) => useDictationLoop(value),
      { initialProps: { value: session({ audioBlob }) } },
    );

    await waitFor(() => expect(saveDictationRecord).toHaveBeenCalledTimes(1));
    rerender({
      value: session({
        audioBlob,
        processingEnabled: false,
      }),
    });

    await act(async () => {
      resolveDraftSave?.();
      await Promise.resolve();
    });

    expect(result.current.state).not.toBe("inserted");
    expect(result.current.message).not.toBe("Nothing to insert.");
  });

  it("inserts the raw transcript after transcription", async () => {
    const audioBlob = recordingBlob();
    transcribeRecording.mockResolvedValueOnce({
      durationMs: 1200,
      model: "universal-3-pro",
      providerEvents: [
        {
          bytesSent: 3,
          completedAt: "2026-05-02T08:30:04.450Z",
          durationMs: 350,
          eventType: "stage",
          metadata: { pollCount: 1 },
          modelId: "universal-3-pro",
          providerId: "assemblyai",
          providerMode: "async",
          sessionId: null,
          stage: "upload",
          startedAt: "2026-05-02T08:30:04.100Z",
          status: "succeeded",
        },
      ],
      providerRequestStartedAt: "2026-05-02T08:30:04.100Z",
      providerResponseReceivedAt: "2026-05-02T08:30:05.300Z",
      providerId: "assemblyai",
      text: "hello",
    });

    const { result } = renderHook(() =>
      useDictationLoop(session({ audioBlob })),
    );

    await waitFor(() => {
      expect(insertIntoActiveTarget).toHaveBeenCalledWith("hello");
    });
    expect(saveDictationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: "hotkey",
        mode: "dictation",
        provider: {
          modelId: "universal-3-pro",
          providerId: "assemblyai",
        },
        transcript: {
          characterCount: 5,
          finalText: "hello",
          rawText: "hello",
        },
        recording: expect.objectContaining({
          analysisMs: 0,
          insertionMs: expect.any(Number),
          postProcessingMs: expect.any(Number),
          reusedWarmStream: true,
          startupMs: 24,
          streamAcquisitionMs: 0,
          transcriptionMs: expect.any(Number),
        }),
        timeline: expect.objectContaining({
          recordingStartedAt: "2026-05-02T08:30:01.000Z",
          recordingStoppedAt: "2026-05-02T08:30:04.000Z",
          processingStartedAt: expect.any(String),
          audioAnalysisCompletedAt: expect.any(String),
          transcriptionStartedAt: expect.any(String),
          providerRequestStartedAt: "2026-05-02T08:30:04.100Z",
          providerResponseReceivedAt: "2026-05-02T08:30:05.300Z",
          transcriptionCompletedAt: expect.any(String),
          insertionStartedAt: expect.any(String),
          insertionCompletedAt: expect.any(String),
          recordPersistedAt: expect.any(String),
          providerRequests: [
            {
              segmentIndex: 0,
              startedAt: "2026-05-02T08:30:04.100Z",
              completedAt: "2026-05-02T08:30:05.300Z",
              providerId: "assemblyai",
              modelId: "universal-3-pro",
              status: "succeeded",
              errorCode: null,
            },
          ],
          providerEvents: [
            {
              bytesSent: 3,
              completedAt: "2026-05-02T08:30:04.450Z",
              durationMs: 350,
              eventType: "stage",
              metadata: { pollCount: 1 },
              modelId: "universal-3-pro",
              providerId: "assemblyai",
              providerMode: "async",
              sessionId: null,
              stage: "upload",
              startedAt: "2026-05-02T08:30:04.100Z",
              status: "succeeded",
            },
          ],
        }),
        audio: {
          relativePath: "recordings/2026/05/02/recording.webm",
          mimeType: "audio/webm",
          byteLength: 3,
        },
        insertion: {
          errorCode: null,
          errorMessage: null,
          method: "send_input",
          status: "inserted",
        },
      }),
    );

    expect(result.current.state).toBe("inserted");
    expect(result.current.transcript).toBe("hello");
  });

  it("falls back to raw transcription when local capture analysis marks speech as low volume", async () => {
    const audioBlob = recordingBlob();

    const { result } = renderHook(() =>
      useDictationLoop(
        analyzedSession({
          audioBlob,
          captureAnalysis: {
            disposition: "unclear",
            reason: "low_volume",
            metrics: {
              voicedMs: 220,
              leadingTrimMs: 0,
              trailingTrimMs: 0,
              longestPauseMs: 0,
              estimatedSnrDb: 4,
              averageDbfs: -38,
              peakDbfs: -12,
            },
            processedAudio: null,
            transcriptionSegments: [],
          },
        }),
      ),
    );

    await waitFor(() => {
      expect(insertIntoActiveTarget).toHaveBeenCalledWith("hello");
    });

    expect(transcribeRecording).toHaveBeenCalledWith({
      providerId: "openai",
      audioBlob,
      language: "en",
    });
    expect(result.current.state).toBe("inserted");
    expect(saveDictationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        transcript: {
          characterCount: 5,
          finalText: "hello",
          rawText: "hello",
        },
        insertion: {
          errorCode: null,
          errorMessage: null,
          method: "send_input",
          status: "inserted",
        },
      }),
    );
  });

  it("falls back to AssemblyAI async transcription for quiet low-volume speech", async () => {
    const audioBlob = recordingBlob();
    getSelectedSpeechProvider.mockResolvedValue("assemblyai");
    getSystemSettings.mockResolvedValue({
      dictationMode: "standard",
      launchOnStartup: true,
      showSkippedTranscripts: false,
    });
    transcribeRecording.mockResolvedValueOnce({
      durationMs: 1200,
      model: "universal-3-pro",
      providerId: "assemblyai",
      text: "quiet speech",
    });

    const { result } = renderHook(() =>
      useDictationLoop(
        analyzedSession({
          audioBlob,
          captureAnalysis: {
            disposition: "unclear",
            reason: "low_volume",
            metrics: {
              voicedMs: 0,
              leadingTrimMs: 0,
              trailingTrimMs: 0,
              longestPauseMs: 0,
              estimatedSnrDb: 0,
              averageDbfs: -100,
              peakDbfs: -28.3,
            },
            processedAudio: null,
            transcriptionSegments: [],
          },
        }),
      ),
    );

    await waitFor(() => {
      expect(insertIntoActiveTarget).toHaveBeenCalledWith("quiet speech");
    });

    expect(transcribeRecording).toHaveBeenCalledWith({
      providerId: "assemblyai",
      audioBlob,
      language: "en",
    });
    expect(result.current.state).toBe("inserted");
  });

  it("records diagnostic checkpoints around AssemblyAI async fallback processing", async () => {
    const audioBlob = recordingBlob();
    getSelectedSpeechProvider.mockResolvedValue("assemblyai");
    getSystemSettings.mockResolvedValue({
      dictationMode: "standard",
      launchOnStartup: true,
      showSkippedTranscripts: false,
    });
    transcribeRecording.mockResolvedValueOnce({
      durationMs: 1200,
      model: "universal-3-pro",
      providerId: "assemblyai",
      text: "diagnostic text",
    });

    renderHook(() =>
      useDictationLoop(
        session({
          audioBlob,
          streamingError: "provider closed streaming socket",
        }),
      ),
    );

    await waitFor(() => {
      expect(insertIntoActiveTarget).toHaveBeenCalledWith("diagnostic text");
    });

    expect(recordStartupCheckpoint).toHaveBeenCalledWith({
      windowLabel: "voice-capsule",
      checkpoint: "dictation_loop_processing_started",
      detail: expect.stringContaining("providerId=assemblyai"),
    });
    expect(recordStartupCheckpoint).toHaveBeenCalledWith({
      windowLabel: "voice-capsule",
      checkpoint: "dictation_loop_transcription_started",
      detail: expect.stringContaining("streamingFallback=true"),
    });
    expect(recordStartupCheckpoint).toHaveBeenCalledWith({
      windowLabel: "voice-capsule",
      checkpoint: "dictation_loop_transcription_completed",
      detail: expect.stringContaining("textChars=15"),
    });
  });

  it("skips provider transcription when low-volume capture has no meaningful peak", async () => {
    const audioBlob = recordingBlob();

    const { result } = renderHook(() =>
      useDictationLoop(
        analyzedSession({
          audioBlob,
          captureAnalysis: {
            disposition: "unclear",
            reason: "low_volume",
            metrics: {
              voicedMs: 0,
              leadingTrimMs: 0,
              trailingTrimMs: 0,
              longestPauseMs: 0,
              estimatedSnrDb: 0,
              averageDbfs: -48,
              peakDbfs: -35,
            },
            processedAudio: null,
            transcriptionSegments: [],
          },
        }),
      ),
    );

    await waitFor(() => {
      expect(result.current.error?.kind).toBe("capture");
    });

    expect(transcribeRecording).not.toHaveBeenCalled();
    expect(saveDictationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        timeline: expect.objectContaining({
          recordingStartedAt: "2026-05-02T08:30:01.000Z",
          recordingStoppedAt: "2026-05-02T08:30:04.000Z",
          processingStartedAt: expect.any(String),
          audioAnalysisCompletedAt: expect.any(String),
          recordPersistedAt: expect.any(String),
          providerRequests: [],
        }),
        insertion: {
          errorCode: "speech_unclear",
          errorMessage: "Speech unclear. Try again closer to the mic.",
          method: null,
          status: "skipped",
        },
      }),
    );
  });

  it("skips provider transcription when local capture analysis detects no speech", async () => {
    const audioBlob = recordingBlob();

    const { result } = renderHook(() =>
      useDictationLoop(
        analyzedSession({
          audioBlob,
          captureAnalysis: {
            disposition: "unclear",
            reason: "no_speech",
            metrics: {
              voicedMs: 0,
              leadingTrimMs: 0,
              trailingTrimMs: 0,
              longestPauseMs: 0,
              estimatedSnrDb: 0,
              averageDbfs: -100,
              peakDbfs: -100,
            },
            processedAudio: null,
            transcriptionSegments: [],
          },
        }),
      ),
    );

    await waitFor(() => {
      expect(result.current.error?.kind).toBe("capture");
    });

    expect(transcribeRecording).not.toHaveBeenCalled();
    expect(result.current.message).toBe("No speech detected.");
    expect(saveDictationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        timeline: expect.objectContaining({
          providerEvents: [
            {
              durationMs: null,
              eventType: "local_speech_gate",
              metadata: {
                averageDbfs: -100,
                decision: "skip",
                estimatedSnrDb: 0,
                leadingTrimMs: 0,
                longestPauseMs: 0,
                peakDbfs: -100,
                reason: "no_speech",
                trailingTrimMs: 0,
                voicedMs: 0,
              },
              modelId: null,
              providerId: "openai",
              providerMode: "async",
              sessionId: null,
              stage: "local_speech_gate",
              status: "skipped",
            },
          ],
          providerRequests: [],
        }),
        insertion: {
          errorCode: "speech_unclear",
          errorMessage: "No speech detected.",
          method: null,
          status: "skipped",
        },
      }),
    );
  });

  it.each(["too_short", "low_snr"] as const)(
    "falls back to raw transcription when local capture analysis reports %s",
    async (reason) => {
      const audioBlob = recordingBlob();

      const { result } = renderHook(() =>
        useDictationLoop(
          analyzedSession({
            audioBlob,
            captureAnalysis: {
              disposition: "unclear",
              reason,
              metrics: {
                voicedMs: reason === "too_short" ? 120 : 900,
                leadingTrimMs: 0,
                trailingTrimMs: 0,
                longestPauseMs: 0,
                estimatedSnrDb: reason === "low_snr" ? 4 : 18,
                averageDbfs: -29,
                peakDbfs: -12,
              },
              processedAudio: null,
              transcriptionSegments: [],
            },
          }),
        ),
      );

      await waitFor(() => {
        expect(insertIntoActiveTarget).toHaveBeenCalledWith("hello");
      });

      expect(transcribeRecording).toHaveBeenCalledWith({
        providerId: "openai",
        audioBlob,
        language: "en",
      });
      expect(result.current.state).toBe("inserted");
    },
  );

  it("transcribes capture-analysis segments in order and joins them once", async () => {
    const audioBlob = recordingBlob();
    const firstSegment = new Blob(["first"], { type: "audio/wav" });
    const secondSegment = new Blob(["second"], { type: "audio/wav" });
    transcribeRecording.mockImplementation(async ({ audioBlob: nextBlob }) => ({
      durationMs: nextBlob === firstSegment ? 600 : 500,
      model: "gpt-4o-mini-transcribe",
      providerId: "openai",
      text: nextBlob === firstSegment ? "hello" : "world",
    }));

    renderHook(() =>
      useDictationLoop(
        analyzedSession({
          audioBlob,
          captureAnalysis: {
            disposition: "ready",
            reason: null,
            metrics: {
              voicedMs: 1800,
              leadingTrimMs: 110,
              trailingTrimMs: 150,
              longestPauseMs: 940,
              estimatedSnrDb: 18,
              averageDbfs: -19,
              peakDbfs: -7,
            },
            processedAudio: new Blob(["processed"], { type: "audio/wav" }),
            transcriptionSegments: [firstSegment, secondSegment],
          },
        }),
      ),
    );

    await waitFor(() => {
      expect(insertIntoActiveTarget).toHaveBeenCalledWith("hello world");
    });

    expect(transcribeRecording).toHaveBeenCalledTimes(2);
    expect(transcribeRecording).toHaveBeenNthCalledWith(1, {
      providerId: "openai",
      audioBlob: firstSegment,
      language: "en",
    });
    expect(transcribeRecording).toHaveBeenNthCalledWith(2, {
      providerId: "openai",
      audioBlob: secondSegment,
      language: "en",
    });
  });

  it("saves all settled segmented transcription timings on failure", async () => {
    const audioBlob = recordingBlob();
    const firstSegment = new Blob(["failed"], { type: "audio/wav" });
    const secondSegment = new Blob(["completed"], { type: "audio/wav" });
    transcribeRecording.mockImplementation(async () => {
      if (transcribeRecording.mock.calls.length === 1) {
        return Promise.reject({
          code: "provider_upstream_failed",
          message: "upstream failed",
          providerRequestStartedAt: "2026-05-02T08:30:04.100Z",
          providerResponseReceivedAt: "2026-05-02T08:30:04.900Z",
        });
      }

      return {
        durationMs: 500,
        model: "gpt-4o-mini-transcribe",
        providerRequestStartedAt: "2026-05-02T08:30:04.200Z",
        providerResponseReceivedAt: "2026-05-02T08:30:05.300Z",
        providerId: "openai",
        text: "world",
      };
    });

    const { result } = renderHook(() =>
      useDictationLoop(
        analyzedSession({
          audioBlob,
          captureAnalysis: {
            disposition: "ready",
            reason: null,
            metrics: {
              voicedMs: 1800,
              leadingTrimMs: 110,
              trailingTrimMs: 150,
              longestPauseMs: 940,
              estimatedSnrDb: 18,
              averageDbfs: -19,
              peakDbfs: -7,
            },
            processedAudio: new Blob(["processed"], { type: "audio/wav" }),
            transcriptionSegments: [firstSegment, secondSegment],
          },
        }),
      ),
    );

    await waitFor(() => {
      expect(transcribeRecording).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(persistDictationAudio).toHaveBeenCalled();
    }, { timeout: 3000 });
    await waitFor(() => {
      expect(result.current.state).not.toBe("transcribing");
    }, { timeout: 3000 });
    expect(saveDictationRecord).toHaveBeenCalled();
    expect(result.current.error?.kind).toBe("transcription");

    expect(saveDictationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        timeline: expect.objectContaining({
          providerRequestStartedAt: "2026-05-02T08:30:04.100Z",
          providerResponseReceivedAt: "2026-05-02T08:30:05.300Z",
          providerRequests: expect.arrayContaining([
            expect.objectContaining({
              segmentIndex: 0,
              startedAt: "2026-05-02T08:30:04.100Z",
              completedAt: "2026-05-02T08:30:04.900Z",
              providerId: "openai",
              modelId: null,
              status: "failed",
              errorCode: "provider_upstream_failed",
            }),
            expect.objectContaining({
              segmentIndex: 1,
              startedAt: "2026-05-02T08:30:04.200Z",
              completedAt: "2026-05-02T08:30:05.300Z",
              providerId: "openai",
              modelId: "gpt-4o-mini-transcribe",
              status: "succeeded",
              errorCode: null,
            }),
          ]),
        }),
        insertion: expect.objectContaining({
          errorCode: "transcription_failed",
        }),
      }),
    );
  });

  it("ignores blank provider responses from individual segments and inserts the remaining transcript", async () => {
    const audioBlob = recordingBlob();
    const firstSegment = new Blob(["blank"], { type: "audio/wav" });
    const secondSegment = new Blob(["spoken"], { type: "audio/wav" });
    transcribeRecording.mockImplementation(async ({ audioBlob: nextBlob }) => {
      if (nextBlob === firstSegment) {
        return Promise.reject({ code: "invalid_provider_response" });
      }

      return {
        durationMs: 500,
        model: "gpt-4o-mini-transcribe",
        providerId: "openai",
        text: "world",
      };
    });

    renderHook(() =>
      useDictationLoop(
        analyzedSession({
          audioBlob,
          captureAnalysis: {
            disposition: "ready",
            reason: null,
            metrics: {
              voicedMs: 1800,
              leadingTrimMs: 110,
              trailingTrimMs: 150,
              longestPauseMs: 940,
              estimatedSnrDb: 18,
              averageDbfs: -19,
              peakDbfs: -7,
            },
            processedAudio: new Blob(["processed"], { type: "audio/wav" }),
            transcriptionSegments: [firstSegment, secondSegment],
          },
        }),
      ),
    );

    await waitFor(() => {
      expect(insertIntoActiveTarget).toHaveBeenCalledWith("world");
    });

    expect(saveDictationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        insertion: expect.objectContaining({
          status: "inserted",
        }),
        transcript: {
          characterCount: 5,
          finalText: "world",
          rawText: "world",
        },
      }),
    );
  });

  it("skips insertion when all segments return blank provider responses", async () => {
    const audioBlob = recordingBlob();
    const firstSegment = new Blob(["blank-a"], { type: "audio/wav" });
    const secondSegment = new Blob(["blank-b"], { type: "audio/wav" });
    transcribeRecording.mockRejectedValue({ code: "invalid_provider_response" });

    const { result } = renderHook(() =>
      useDictationLoop(
        analyzedSession({
          audioBlob,
          captureAnalysis: {
            disposition: "ready",
            reason: null,
            metrics: {
              voicedMs: 1800,
              leadingTrimMs: 110,
              trailingTrimMs: 150,
              longestPauseMs: 940,
              estimatedSnrDb: 18,
              averageDbfs: -19,
              peakDbfs: -7,
            },
            processedAudio: new Blob(["processed"], { type: "audio/wav" }),
            transcriptionSegments: [firstSegment, secondSegment],
          },
        }),
      ),
    );

    await waitFor(() => {
      expect(result.current.message).toBe("Nothing to insert.");
    });

    expect(insertIntoActiveTarget).not.toHaveBeenCalled();
    expect(saveDictationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        insertion: {
          errorCode: null,
          errorMessage: null,
          method: null,
          status: "skipped",
        },
        transcript: {
          characterCount: 0,
          finalText: "",
          rawText: "",
        },
      }),
    );
  });

  it("uses the raw recording for AssemblyAI even when processed audio is available", async () => {
    const audioBlob = recordingBlob();
    const processedSegment = new Blob(["processed"], { type: "audio/wav" });
    getSelectedSpeechProvider.mockResolvedValue("assemblyai");
    getSystemSettings.mockResolvedValue({
      dictationMode: "standard",
      launchOnStartup: true,
      showSkippedTranscripts: false,
    });

    renderHook(() =>
      useDictationLoop(
        analyzedSession({
          audioBlob,
          captureAnalysis: {
            disposition: "ready",
            reason: null,
            metrics: {
              voicedMs: 900,
              leadingTrimMs: 120,
              trailingTrimMs: 180,
              longestPauseMs: 0,
              estimatedSnrDb: 16,
              averageDbfs: -20,
              peakDbfs: -8,
            },
            processedAudio: new Blob(["processed-full"], { type: "audio/wav" }),
            transcriptionSegments: [processedSegment],
          },
        }),
      ),
    );

    await waitFor(() => {
      expect(transcribeRecording).toHaveBeenCalledWith({
        providerId: "assemblyai",
        audioBlob,
        language: "en",
      });
    });
  });

  it("inserts a final AssemblyAI streaming transcript without async retranscription", async () => {
    const audioBlob = recordingBlob();
    getSelectedSpeechProvider.mockResolvedValue("assemblyai");

    renderHook(() =>
      useDictationLoop(
        session({
          audioBlob,
          streamingTranscript: "streamed final",
          streamingProviderEvents: [
            {
              eventType: "stream_final_received",
              providerId: "assemblyai",
              providerMode: "streaming",
              modelId: "universal-3-5-pro",
              sessionId: "session-1",
              stage: "receive_final",
              status: "succeeded",
              metadata: { characterCount: 14 },
            },
          ],
        }),
      ),
    );

    await waitFor(() => {
      expect(insertIntoActiveTarget).toHaveBeenCalledWith("streamed final");
    });

    expect(transcribeRecording).not.toHaveBeenCalled();
    expect(saveDictationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: {
          modelId: "universal-3-5-pro",
          providerId: "assemblyai",
        },
        transcript: {
          characterCount: 14,
          finalText: "streamed final",
          rawText: "streamed final",
        },
        timeline: expect.objectContaining({
          providerEvents: [
            expect.objectContaining({
              eventType: "stream_final_received",
              providerMode: "streaming",
            }),
          ],
        }),
      }),
    );
  });

  it("inserts a final Smallest AI streaming transcript without async retranscription", async () => {
    const audioBlob = recordingBlob();
    getSelectedSpeechProvider.mockResolvedValue("smallest");

    renderHook(() =>
      useDictationLoop(
        session({
          audioBlob,
          streamingTranscript: "smallest streamed final",
          streamingProviderEvents: [
            {
              eventType: "stream_final_received",
              providerId: "smallest",
              providerMode: "streaming",
              modelId: "pulse",
              sessionId: "session-1",
              stage: "receive",
              status: "succeeded",
              metadata: { characterCount: 23 },
            },
          ],
        }),
      ),
    );

    await waitFor(() => {
      expect(insertIntoActiveTarget).toHaveBeenCalledWith(
        "smallest streamed final",
      );
    });

    expect(transcribeRecording).not.toHaveBeenCalled();
    expect(saveDictationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: {
          modelId: "pulse",
          providerId: "smallest",
        },
        transcript: {
          characterCount: 23,
          finalText: "smallest streamed final",
          rawText: "smallest streamed final",
        },
      }),
    );
  });

  it("inserts a final ElevenLabs streaming transcript without async retranscription", async () => {
    const audioBlob = recordingBlob();
    getSelectedSpeechProvider.mockResolvedValue("elevenlabs");

    renderHook(() =>
      useDictationLoop(
        session({
          audioBlob,
          streamingTranscript: "elevenlabs streamed final",
          streamingProviderEvents: [
            {
              eventType: "stream_final_received",
              providerId: "elevenlabs",
              providerMode: "streaming",
              modelId: "scribe_v2_realtime",
              sessionId: "session-1",
              stage: "receive",
              status: "succeeded",
              metadata: { characterCount: 25 },
            },
          ],
        }),
      ),
    );

    await waitFor(() => {
      expect(insertIntoActiveTarget).toHaveBeenCalledWith(
        "elevenlabs streamed final",
      );
    });

    expect(transcribeRecording).not.toHaveBeenCalled();
    expect(saveDictationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: {
          modelId: "scribe_v2_realtime",
          providerId: "elevenlabs",
        },
        transcript: {
          characterCount: 25,
          finalText: "elevenlabs streamed final",
          rawText: "elevenlabs streamed final",
        },
      }),
    );
  });

  it("inserts a final Deepgram streaming transcript without async retranscription", async () => {
    const audioBlob = recordingBlob();
    getSelectedSpeechProvider.mockResolvedValue("deepgram");

    renderHook(() =>
      useDictationLoop(
        session({
          audioBlob,
          streamingTranscript: "deepgram streamed final",
          streamingProviderEvents: [
            {
              eventType: "stream_final_received",
              providerId: "deepgram",
              providerMode: "streaming",
              modelId: "nova-3",
              sessionId: "session-1",
              stage: "receive",
              status: "succeeded",
              metadata: { characterCount: 23 },
            },
          ],
        }),
      ),
    );

    await waitFor(() => {
      expect(insertIntoActiveTarget).toHaveBeenCalledWith(
        "deepgram streamed final",
      );
    });

    expect(transcribeRecording).not.toHaveBeenCalled();
    expect(saveDictationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: {
          modelId: "nova-3",
          providerId: "deepgram",
        },
        transcript: {
          characterCount: 23,
          finalText: "deepgram streamed final",
          rawText: "deepgram streamed final",
        },
      }),
    );
  });

  it("waits briefly for an AssemblyAI streaming final before falling back to async", async () => {
    const audioBlob = recordingBlob();
    getSelectedSpeechProvider.mockResolvedValue("assemblyai");
    const streamingStarted = {
      eventType: "stream_session_started",
      providerId: "assemblyai",
      providerMode: "streaming",
      modelId: "u3-rt-pro",
      sessionId: "session-1",
      stage: "connect",
      status: "succeeded",
    } as const;

    const { rerender } = renderHook(
      ({ value }) => useDictationLoop(value),
      {
        initialProps: {
          value: session({
            audioBlob,
            streamingProviderEvents: [streamingStarted],
          }),
        },
      },
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(transcribeRecording).not.toHaveBeenCalled();

    rerender({
      value: session({
        audioBlob,
        streamingProviderEvents: [
          streamingStarted,
          {
            eventType: "stream_final_received",
            providerId: "assemblyai",
            providerMode: "streaming",
            modelId: "u3-rt-pro",
            sessionId: "session-1",
            stage: "receive_final",
            status: "succeeded",
          },
          {
            eventType: "stream_terminated",
            providerId: "assemblyai",
            providerMode: "streaming",
            modelId: "u3-rt-pro",
            sessionId: "session-1",
            stage: "terminate",
            status: "succeeded",
          },
        ],
        streamingTranscript: "low latency text",
      }),
    });

    await act(async () => {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 75));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(insertIntoActiveTarget).toHaveBeenCalledWith("low latency text");
    });
    expect(transcribeRecording).not.toHaveBeenCalled();
  });

  it("waits for streaming termination before inserting an already partial streaming transcript", async () => {
    const audioBlob = recordingBlob();
    getSelectedSpeechProvider.mockResolvedValue("smallest");
    const streamingStarted = {
      eventType: "stream_session_started",
      providerId: "smallest",
      providerMode: "streaming",
      modelId: "pulse",
      sessionId: "session-1",
      stage: "connect",
      status: "succeeded",
    } as const;
    const firstFinal = {
      eventType: "stream_final_received",
      providerId: "smallest",
      providerMode: "streaming",
      modelId: "pulse",
      sessionId: "session-1",
      stage: "receive",
      status: "succeeded",
    } as const;

    const { rerender } = renderHook(
      ({ value }) => useDictationLoop(value),
      {
        initialProps: {
          value: session({
            audioBlob,
            streamingProviderEvents: [streamingStarted, firstFinal],
            streamingTranscript: "first two lines",
          }),
        },
      },
    );

    await waitFor(() => {
      expect(recordStartupCheckpoint).toHaveBeenCalledWith({
        windowLabel: "voice-capsule",
        checkpoint: "dictation_loop_transcription_started",
        detail: expect.stringContaining("streamingTranscriptChars=15"),
      });
    });
    expect(insertIntoActiveTarget).not.toHaveBeenCalled();

    rerender({
      value: session({
        audioBlob,
        streamingProviderEvents: [
          streamingStarted,
          firstFinal,
          {
            eventType: "stream_terminated",
            providerId: "smallest",
            providerMode: "streaming",
            modelId: "pulse",
            sessionId: "session-1",
            stage: "terminate",
            status: "succeeded",
          },
        ],
        streamingTranscript: "first two lines final line",
      }),
    });

    await act(async () => {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 75));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(insertIntoActiveTarget).toHaveBeenCalledWith(
        "first two lines final line",
      );
    });
    expect(transcribeRecording).not.toHaveBeenCalled();
  });

  it("falls back to async AssemblyAI when streaming fails before a final transcript", async () => {
    const audioBlob = recordingBlob();
    getSelectedSpeechProvider.mockResolvedValue("assemblyai");
    transcribeRecording.mockResolvedValueOnce({
      durationMs: 1200,
      model: "universal-3-pro",
      providerId: "assemblyai",
      text: "async fallback",
    });

    renderHook(() =>
      useDictationLoop(
        session({
          audioBlob,
          streamingError: "AssemblyAI streaming is disabled",
          streamingProviderEvents: [
            {
              eventType: "stream_error",
              providerId: "assemblyai",
              providerMode: "streaming",
              modelId: "u3-rt-pro",
              sessionId: "session-1",
              stage: "receive",
              status: "failed",
              errorCode: "provider_request_failed",
            },
          ],
        }),
      ),
    );

    await waitFor(() => {
      expect(insertIntoActiveTarget).toHaveBeenCalledWith("async fallback");
    });

    expect(transcribeRecording).toHaveBeenCalledWith({
      providerId: "assemblyai",
      audioBlob,
      language: "en",
    });
    expect(saveDictationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        timeline: expect.objectContaining({
          providerEvents: expect.arrayContaining([
            expect.objectContaining({ eventType: "stream_error" }),
            expect.objectContaining({
              eventType: "stream_fallback_async_started",
              providerMode: "streaming",
            }),
          ]),
        }),
      }),
    );
  });

  it("falls back to batch ElevenLabs when streaming fails before a final transcript", async () => {
    const audioBlob = recordingBlob();
    getSelectedSpeechProvider.mockResolvedValue("elevenlabs");
    transcribeRecording.mockResolvedValueOnce({
      durationMs: 1200,
      model: "scribe_v2",
      providerId: "elevenlabs",
      text: "elevenlabs batch fallback",
    });

    renderHook(() =>
      useDictationLoop(
        session({
          audioBlob,
          streamingError: "ElevenLabs streaming is unavailable",
          streamingProviderEvents: [
            {
              eventType: "stream_error",
              providerId: "elevenlabs",
              providerMode: "streaming",
              modelId: "scribe_v2_realtime",
              sessionId: "session-1",
              stage: "receive",
              status: "failed",
              errorCode: "provider_request_failed",
            },
          ],
        }),
      ),
    );

    await waitFor(() => {
      expect(insertIntoActiveTarget).toHaveBeenCalledWith(
        "elevenlabs batch fallback",
      );
    });

    expect(transcribeRecording).toHaveBeenCalledWith({
      providerId: "elevenlabs",
      audioBlob,
      language: "en",
    });
    expect(saveDictationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        timeline: expect.objectContaining({
          providerEvents: expect.arrayContaining([
            expect.objectContaining({ eventType: "stream_error" }),
            expect.objectContaining({
              eventType: "stream_fallback_async_started",
              providerMode: "streaming",
            }),
          ]),
        }),
      }),
    );
  });

  it("falls back to batch Deepgram when streaming fails before a final transcript", async () => {
    const audioBlob = recordingBlob();
    getSelectedSpeechProvider.mockResolvedValue("deepgram");
    transcribeRecording.mockResolvedValueOnce({
      durationMs: 1200,
      model: "nova-3",
      providerId: "deepgram",
      text: "deepgram batch fallback",
    });

    renderHook(() =>
      useDictationLoop(
        session({
          audioBlob,
          streamingError: "Deepgram streaming is unavailable",
          streamingProviderEvents: [
            {
              eventType: "stream_error",
              providerId: "deepgram",
              providerMode: "streaming",
              modelId: "nova-3",
              sessionId: "session-1",
              stage: "receive",
              status: "failed",
              errorCode: "provider_request_failed",
            },
          ],
        }),
      ),
    );

    await waitFor(() => {
      expect(insertIntoActiveTarget).toHaveBeenCalledWith(
        "deepgram batch fallback",
      );
    });

    expect(transcribeRecording).toHaveBeenCalledWith({
      providerId: "deepgram",
      audioBlob,
      language: "en",
    });
    expect(saveDictationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        timeline: expect.objectContaining({
          providerEvents: expect.arrayContaining([
            expect.objectContaining({ eventType: "stream_error" }),
            expect.objectContaining({
              eventType: "stream_fallback_async_started",
              providerMode: "streaming",
            }),
          ]),
        }),
      }),
    );
  });

  it("keeps the selected provider when system settings loading fails", async () => {
    const audioBlob = recordingBlob();
    getSelectedSpeechProvider.mockResolvedValue("assemblyai");
    getSystemSettings.mockRejectedValue(new Error("settings unavailable"));
    transcribeRecording.mockResolvedValueOnce({
      durationMs: 1200,
      model: "universal-3-pro",
      providerId: "assemblyai",
      text: "assembly transcript",
    });

    renderHook(() =>
      useDictationLoop(
        session({
          audioBlob,
          streamingError: "AssemblyAI streaming unavailable",
        }),
      ),
    );

    await waitFor(() => {
      expect(insertIntoActiveTarget).toHaveBeenCalledWith("assembly transcript");
    });
    expect(transcribeRecording).toHaveBeenCalledWith({
      providerId: "assemblyai",
      audioBlob,
      language: "en",
    });
  });

  it("falls back to async AssemblyAI when forced streaming is unavailable", async () => {
    const audioBlob = recordingBlob();
    getSelectedSpeechProvider.mockResolvedValue("assemblyai");
    getSystemSettings.mockResolvedValue({
      dictationMode: "streaming",
      launchOnStartup: true,
      showSkippedTranscripts: false,
    });
    transcribeRecording.mockResolvedValueOnce({
      durationMs: 1200,
      model: "universal-3-pro",
      providerId: "assemblyai",
      text: "normal fallback",
    });

    renderHook(() =>
      useDictationLoop(
        session({
          audioBlob,
          streamingError: "AssemblyAI streaming is disabled",
          streamingProviderEvents: [
            {
              eventType: "stream_error",
              providerId: "assemblyai",
              providerMode: "streaming",
              modelId: "u3-rt-pro",
              sessionId: "session-1",
              stage: "receive",
              status: "failed",
              errorCode: "provider_request_failed",
            },
          ],
        }),
      ),
    );

    await waitFor(() => {
      expect(insertIntoActiveTarget).toHaveBeenCalledWith("normal fallback");
    });

    expect(transcribeRecording).toHaveBeenCalledWith({
      providerId: "assemblyai",
      audioBlob,
      language: "en",
    });
  });

  it("continues saving the dictation record when audio persistence fails", async () => {
    const audioBlob = recordingBlob();
    persistDictationAudio.mockRejectedValue(new Error("disk unavailable"));

    renderHook(() => useDictationLoop(session({ audioBlob })));

    await waitFor(() => {
      expect(saveDictationRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: null,
          transcript: {
            characterCount: 5,
            finalText: "hello",
            rawText: "hello",
          },
        }),
      );
    });
  });

  it("persists both original and processed audio when capture analysis provides a processed blob", async () => {
    const audioBlob = recordingBlob();
    const processedAudioBlob = new Blob(["processed"], { type: "audio/wav" });
    persistDictationAudio
      .mockResolvedValueOnce({
        relativePath: "recordings/2026/05/02/raw.webm",
        mimeType: "audio/webm",
        byteLength: 3,
      })
      .mockResolvedValueOnce({
        relativePath: "recordings/2026/05/02/processed.wav",
        mimeType: "audio/wav",
        byteLength: 9,
      });

    renderHook(() =>
      useDictationLoop(
        analyzedSession({
          audioBlob,
          captureAnalysis: {
            disposition: "ready",
            reason: null,
            metrics: {
              voicedMs: 900,
              leadingTrimMs: 120,
              trailingTrimMs: 180,
              longestPauseMs: 0,
              estimatedSnrDb: 16,
              averageDbfs: -20,
              peakDbfs: -8,
            },
            processedAudio: processedAudioBlob,
            transcriptionSegments: [recordingBlob()],
          },
        }),
      ),
    );

    await waitFor(() => {
      expect(saveDictationRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: {
            relativePath: "recordings/2026/05/02/raw.webm",
            mimeType: "audio/webm",
            byteLength: 3,
          },
          processedAudio: {
            relativePath: "recordings/2026/05/02/processed.wav",
            mimeType: "audio/wav",
            byteLength: 9,
          },
        }),
      );
    });
  });

  it("does not persist processed audio artifacts in production", async () => {
    appEnvironment.appEnv = "production";
    appEnvironment.exposeProcessedAudioArtifacts = false;
    const audioBlob = recordingBlob();
    const processedAudioBlob = new Blob(["processed"], { type: "audio/wav" });
    persistDictationAudio.mockResolvedValueOnce({
      relativePath: "recordings/2026/05/02/raw.webm",
      mimeType: "audio/webm",
      byteLength: 3,
    });

    renderHook(() =>
      useDictationLoop(
        analyzedSession({
          audioBlob,
          captureAnalysis: {
            disposition: "ready",
            reason: null,
            metrics: {
              voicedMs: 900,
              leadingTrimMs: 120,
              trailingTrimMs: 180,
              longestPauseMs: 0,
              estimatedSnrDb: 16,
              averageDbfs: -20,
              peakDbfs: -8,
            },
            processedAudio: processedAudioBlob,
            transcriptionSegments: [recordingBlob()],
          },
        }),
      ),
    );

    await waitFor(() => {
      expect(saveDictationRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: {
            relativePath: "recordings/2026/05/02/raw.webm",
            mimeType: "audio/webm",
            byteLength: 3,
          },
          processedAudio: null,
        }),
      );
    });

    expect(persistDictationAudio).toHaveBeenCalledTimes(1);
  });

  it("skips insertion for empty transcripts", async () => {
    const audioBlob = recordingBlob();
    transcribeRecording.mockResolvedValue({
      durationMs: 1200,
      model: "gpt-4o-mini-transcribe",
      providerId: "openai",
      text: "   ",
    });

    const { result } = renderHook(() =>
      useDictationLoop(session({ audioBlob })),
    );

    await waitFor(() => {
      expect(result.current.message).toBe("Nothing to insert.");
    });

    expect(insertIntoActiveTarget).not.toHaveBeenCalled();
    expect(result.current.state).toBe("inserted");
  });

  it("surfaces transcription errors", async () => {
    const audioBlob = recordingBlob();
    transcribeRecording.mockRejectedValue({
      code: "provider_upstream_failed",
      message: "provider unavailable",
      providerRequestStartedAt: "2026-05-02T08:30:04.100Z",
      providerResponseReceivedAt: "2026-05-02T08:30:05.300Z",
    });

    const { result } = renderHook(() =>
      useDictationLoop(session({ audioBlob })),
    );

    await waitFor(() => {
      expect(result.current.error?.kind).toBe("transcription");
    });

    expect(result.current.state).toBe("error");
    expect(result.current.message).toBe(
      "OpenAI: provider_upstream_failed: provider unavailable",
    );
    expect(insertIntoActiveTarget).not.toHaveBeenCalled();
    expect(saveDictationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        timeline: expect.objectContaining({
          providerRequestStartedAt: "2026-05-02T08:30:04.100Z",
          providerResponseReceivedAt: "2026-05-02T08:30:05.300Z",
          transcriptionStartedAt: expect.any(String),
          transcriptionCompletedAt: expect.any(String),
          recordPersistedAt: expect.any(String),
          providerRequests: [
            {
              segmentIndex: 0,
              startedAt: "2026-05-02T08:30:04.100Z",
              completedAt: "2026-05-02T08:30:05.300Z",
              providerId: "openai",
              modelId: null,
              status: "failed",
              errorCode: "provider_upstream_failed",
            },
          ],
        }),
        insertion: expect.objectContaining({
          errorCode: "transcription_failed",
          status: "failed",
        }),
      }),
    );
  });

  it("uses the Deepgram display label in transcription errors", async () => {
    const audioBlob = recordingBlob();
    getSelectedSpeechProvider.mockResolvedValue("deepgram");
    getSystemSettings.mockResolvedValue({
      dictationMode: "standard",
      launchOnStartup: true,
      showSkippedTranscripts: false,
    });
    transcribeRecording.mockRejectedValue(new Error("provider unavailable"));

    const { result } = renderHook(() =>
      useDictationLoop(session({ audioBlob })),
    );

    await waitFor(() => {
      expect(result.current.error?.kind).toBe("transcription");
    });

    expect(result.current.message).toBe("Deepgram: provider unavailable");
  });

  it("surfaces guarded insertion errors without alternate insertion", async () => {
    const audioBlob = recordingBlob();
    insertIntoActiveTarget.mockRejectedValue(new Error("target changed"));

    const { result } = renderHook(() =>
      useDictationLoop(session({ audioBlob })),
    );

    await waitFor(() => {
      expect(result.current.error?.kind).toBe("insertion");
    });

    expect(insertIntoActiveTarget).toHaveBeenCalledTimes(1);
    expect(insertIntoActiveTarget).toHaveBeenCalledWith("hello");
    expect(saveDictationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        timeline: expect.objectContaining({
          providerRequestStartedAt: "2026-05-02T08:30:04.100Z",
          providerResponseReceivedAt: "2026-05-02T08:30:05.300Z",
          insertionStartedAt: expect.any(String),
          insertionCompletedAt: expect.any(String),
          recordPersistedAt: expect.any(String),
        }),
        insertion: expect.objectContaining({
          errorCode: "insertion_failed",
          status: "failed",
        }),
      }),
    );
    expect(result.current.state).toBe("error");
    expect(result.current.message).toBe("Insertion failed: target changed");
  });

  it("times out hanging insertions and saves the failed dictation record", async () => {
    const audioBlob = recordingBlob();
    insertIntoActiveTarget.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() =>
      useDictationLoop(session({ audioBlob })),
    );

    await vi.waitFor(() => {
      expect(insertIntoActiveTarget).toHaveBeenCalledWith("hello");
    });
    expect(result.current.state).toBe("inserting");

    await waitFor(
      () => {
        expect(result.current.error?.kind).toBe("insertion");
      },
      { timeout: 6_000 },
    );

    expect(result.current.state).toBe("error");
    expect(result.current.message).toBe(
      "Insertion failed: Insertion timed out after 5000ms.",
    );
    expect(saveDictationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        insertion: {
          errorCode: "insertion_failed",
          errorMessage: "Insertion failed: Insertion timed out after 5000ms.",
          method: null,
          status: "failed",
        },
        transcript: {
          characterCount: 5,
          finalText: "hello",
          rawText: "hello",
        },
      }),
    );
    expect(recordStartupCheckpoint).toHaveBeenCalledWith({
      windowLabel: "voice-capsule",
      checkpoint: "dictation_loop_insertion_failed",
      detail: expect.stringContaining("timed out"),
    });
  });

  it("does not transcribe or insert command-mode recordings", async () => {
    const audioBlob = recordingBlob();

    const { result } = renderHook(() =>
      useDictationLoop(session({ audioBlob, completedMode: "command" })),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(transcribeRecording).not.toHaveBeenCalled();
    expect(insertIntoActiveTarget).not.toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
  });

  it("does not transcribe or insert verification-only recordings", async () => {
    const audioBlob = recordingBlob();

    const { result } = renderHook(() =>
      useDictationLoop(session({ audioBlob, processingEnabled: false })),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(transcribeRecording).not.toHaveBeenCalled();
    expect(insertIntoActiveTarget).not.toHaveBeenCalled();
    expect(saveDictationRecord).not.toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
  });

  it("resets stale inserted state when a command-mode recording completes", async () => {
    const audioBlob = recordingBlob();
    const { result, rerender } = renderHook(
      ({ value }) => useDictationLoop(value),
      { initialProps: { value: session({ audioBlob }) } },
    );

    await waitFor(() => {
      expect(result.current.state).toBe("inserted");
    });

    rerender({
      value: session({
        audioBlob: recordingBlob(),
        completedMode: "command",
      }),
    });

    await waitFor(() => {
      expect(result.current.state).toBe("idle");
    });
    expect(result.current.message).toBe("Recorder ready.");
  });

  it("does not transcribe or insert when focus capture failed", async () => {
    const audioBlob = recordingBlob();

    const { result } = renderHook(() =>
      useDictationLoop(
        session({
          audioBlob,
          completedMode: "dictation",
          focusedFieldError: "No writable text field found for dictation.",
        }),
      ),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(transcribeRecording).not.toHaveBeenCalled();
    expect(insertIntoActiveTarget).not.toHaveBeenCalled();
    expect(result.current.error?.kind).toBe("focus");
  });
});
