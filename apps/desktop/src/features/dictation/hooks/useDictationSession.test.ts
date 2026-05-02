import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useMicrophoneSelection } from "@/hooks/useMicrophoneSelection";

import { useDictationSession } from "./useDictationSession";

vi.mock("@/hooks/useAudioRecorder", () => ({
  useAudioRecorder: vi.fn(),
}));

vi.mock("@/hooks/useMicrophoneSelection", () => ({
  useMicrophoneSelection: vi.fn(),
}));

const startRecording = vi.fn();

describe("useDictationSession", () => {
  beforeEach(() => {
    vi.mocked(useAudioRecorder).mockReturnValue({
      activeMicrophone: null,
      audioBlob: null,
      audioUrl: null,
      elapsedMs: 0,
      error: null,
      reset: vi.fn(),
      start: startRecording,
      status: "idle",
      stop: vi.fn(),
    });
    vi.mocked(useMicrophoneSelection).mockReturnValue({
      activeMicrophone: null,
      devices: [{ deviceId: "other-mic", label: "Other microphone" }],
      error: null,
      hasPermission: true,
      isLoading: false,
      isManualUnavailable: true,
      isResolving: false,
      manualUnavailableMessage:
        "Selected microphone is unavailable. Choose another device or switch to system selected.",
      refresh: vi.fn(),
      requestMicrophoneAccess: vi.fn(),
      requestPermission: vi.fn(),
      selectManual: vi.fn(),
      selectSystem: vi.fn(),
      selection: { mode: "manual", deviceId: "usb-mic" },
    });
    startRecording.mockReset();
  });

  it("blocks recording when the selected manual microphone is unavailable", async () => {
    const { result } = renderHook(() => useDictationSession());

    await act(async () => {
      await result.current.startManualDictation();
    });

    expect(useAudioRecorder).toHaveBeenCalledWith({
      microphoneSelection: { mode: "manual", deviceId: "usb-mic" },
    });
    expect(startRecording).not.toHaveBeenCalled();
    expect(result.current.focusedFieldError).toBe(
      "Selected microphone is unavailable. Choose another device or switch to system selected.",
    );
  });
});
