import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDictationLoop, type DictationLoopSession } from "./useDictationLoop";

const {
  getSelectedSpeechProvider,
  insertIntoActiveTarget,
  listenToTauriEvent,
  transcribeRecording,
} = vi.hoisted(() => ({
  getSelectedSpeechProvider: vi.fn(),
  insertIntoActiveTarget: vi.fn(),
  listenToTauriEvent: vi.fn(),
  transcribeRecording: vi.fn(),
}));

vi.mock("@/lib/tauri", () => ({
  SPEECH_PROVIDER_CHANGED_EVENT: "vaak://speech-provider-changed",
  getSelectedSpeechProvider,
  insertIntoActiveTarget,
  listenToTauriEvent,
  transcribeRecording,
}));

function session(overrides: Partial<DictationLoopSession> = {}) {
  return {
    completedMode: "dictation",
    audioBlob: null,
    focusedFieldError: null,
    isRecording: false,
    recorderError: null,
    ...overrides,
  } satisfies DictationLoopSession;
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
    transcribeRecording.mockResolvedValue({
      durationMs: 1200,
      model: "gpt-4o-mini-transcribe",
      providerId: "openai",
      text: "hello",
    });
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

    expect(result.current.state).toBe("inserted");
    expect(result.current.transcript).toBe("hello");
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
