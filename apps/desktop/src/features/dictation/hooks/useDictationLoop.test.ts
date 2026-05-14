import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDictationLoop, type DictationLoopSession } from "./useDictationLoop";

const {
  getSelectedSpeechProvider,
  insertIntoActiveTarget,
  listenToTauriEvent,
  persistDictationAudio,
  saveDictationRecord,
  targetSnapshotFromFocusedField,
  transcribeRecording,
} = vi.hoisted(() => ({
  getSelectedSpeechProvider: vi.fn(),
  insertIntoActiveTarget: vi.fn(),
  listenToTauriEvent: vi.fn(),
  persistDictationAudio: vi.fn(),
  saveDictationRecord: vi.fn(),
  targetSnapshotFromFocusedField: vi.fn(),
  transcribeRecording: vi.fn(),
}));

vi.mock("@/lib/tauri", () => ({
  SPEECH_PROVIDER_CHANGED_EVENT: "vaak://speech-provider-changed",
  getSelectedSpeechProvider,
  insertIntoActiveTarget,
  listenToTauriEvent,
  persistDictationAudio,
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

describe("useDictationLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSelectedSpeechProvider.mockResolvedValue("openai");
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
      providerId: "openai",
      text: "hello",
    });
    appEnvironment.appEnv = "development";
    appEnvironment.exposeProcessedAudioArtifacts = true;
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

  it("inserts the raw transcript after transcription", async () => {
    const audioBlob = recordingBlob();

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
          modelId: "gpt-4o-mini-transcribe",
          providerId: "openai",
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

  it("uses the raw recording for AssemblyAI even when processed audio is available", async () => {
    const audioBlob = recordingBlob();
    const processedSegment = new Blob(["processed"], { type: "audio/wav" });
    getSelectedSpeechProvider.mockResolvedValue("assemblyai");

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
    transcribeRecording.mockRejectedValue(new Error("provider unavailable"));

    const { result } = renderHook(() =>
      useDictationLoop(session({ audioBlob })),
    );

    await waitFor(() => {
      expect(result.current.error?.kind).toBe("transcription");
    });

    expect(result.current.state).toBe("error");
    expect(result.current.message).toBe("OpenAI: provider unavailable");
    expect(insertIntoActiveTarget).not.toHaveBeenCalled();
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
    expect(result.current.state).toBe("error");
    expect(result.current.message).toBe("Insertion failed: target changed");
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
