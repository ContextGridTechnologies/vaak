import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useMicrophoneSelection } from "@/hooks/useMicrophoneSelection";
import type { SessionHotkeyEvent } from "@/lib/tauri";

import { useDictationSession } from "./useDictationSession";

const {
  captureDictationTarget,
  getFocusedField,
  getHotkeyBindings,
  isTauriRuntime,
  listenToTauriEvent,
} = vi.hoisted(() => ({
    captureDictationTarget: vi.fn(),
    getFocusedField: vi.fn(),
    getHotkeyBindings: vi.fn(),
    isTauriRuntime: vi.fn(),
    listenToTauriEvent: vi.fn(),
  }));

vi.mock("@/hooks/useAudioRecorder", () => ({
  useAudioRecorder: vi.fn(),
}));

vi.mock("@/hooks/useMicrophoneSelection", () => ({
  useMicrophoneSelection: vi.fn(),
}));

vi.mock("@/lib/tauri", () => ({
  captureDictationTarget,
  getFocusedField,
  getHotkeyBindings,
  isTauriRuntime,
  listenToTauriEvent,
}));

const startRecording = vi.fn();
const stopRecording = vi.fn();
const prepareRecording = vi.fn();

const field = {
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
};

function setWindowsPlatform() {
  Object.defineProperty(navigator, "platform", {
    configurable: true,
    value: "Win32",
  });
}

function useAvailableMicrophone() {
  vi.mocked(useMicrophoneSelection).mockReturnValue({
    activeMicrophone: null,
    devices: [{ deviceId: "system", label: "System microphone" }],
    error: null,
    hasPermission: true,
    isLoading: false,
    isManualUnavailable: false,
    isResolving: false,
    manualUnavailableMessage: null,
    refresh: vi.fn(),
    requestMicrophoneAccess: vi.fn(),
    requestPermission: vi.fn(),
    selectManual: vi.fn(),
    selectSystem: vi.fn(),
    selection: { mode: "system" },
  });
}

describe("useDictationSession", () => {
  beforeEach(() => {
    vi.mocked(useAudioRecorder).mockReturnValue({
      activeMicrophone: null,
      audioBlob: null,
      audioLevel: 0,
      audioUrl: null,
      captureAnalysis: null,
      elapsedMs: 0,
      error: null,
      prepare: prepareRecording,
      reset: vi.fn(),
      start: startRecording,
      status: "idle",
      stop: stopRecording,
      startupMetrics: null,
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
        "Selected microphone is unavailable. Choose another device or switch to automatic mode.",
      refresh: vi.fn(),
      requestMicrophoneAccess: vi.fn(),
      requestPermission: vi.fn(),
      selectManual: vi.fn(),
      selectSystem: vi.fn(),
      selection: { mode: "manual", deviceId: "usb-mic" },
    });
    captureDictationTarget.mockResolvedValue(field);
    getFocusedField.mockResolvedValue(field);
    getHotkeyBindings.mockResolvedValue({
      command: "Ctrl+Win+Alt",
      dictation: "Ctrl+Win",
    });
    isTauriRuntime.mockReturnValue(false);
    listenToTauriEvent.mockResolvedValue(() => {});
    startRecording.mockReset();
    stopRecording.mockReset();
    prepareRecording.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
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
      "Selected microphone is unavailable. Choose another device or switch to automatic mode.",
    );
  });

  it("captures and seeds the backend target before manual dictation starts", async () => {
    useAvailableMicrophone();

    const { result } = renderHook(() => useDictationSession());

    await act(async () => {
      await result.current.startManualDictation();
    });

    expect(captureDictationTarget).toHaveBeenCalledTimes(1);
    expect(getFocusedField).not.toHaveBeenCalled();
    expect(startRecording).toHaveBeenCalledTimes(1);
    expect(result.current.focusedField).toEqual(field);
    expect(result.current.activeMode).toBe("dictation");
  });

  it("warms the recorder stream in the background when microphone permission is already granted", async () => {
    useAvailableMicrophone();

    renderHook(() => useDictationSession());

    await vi.waitFor(() => expect(prepareRecording).toHaveBeenCalledTimes(1));
  });

  it("does not warm or subscribe to hotkeys when disabled", async () => {
    setWindowsPlatform();
    useAvailableMicrophone();
    isTauriRuntime.mockReturnValue(true);

    renderHook(() => useDictationSession({ enabled: false }));

    expect(prepareRecording).not.toHaveBeenCalled();
    expect(getHotkeyBindings).not.toHaveBeenCalled();
    expect(listenToTauriEvent).not.toHaveBeenCalled();
  });

  it("starts recording with the captured target from a dictation hotkey start", async () => {
    setWindowsPlatform();
    useAvailableMicrophone();
    isTauriRuntime.mockReturnValue(true);
    let handler:
      | ((event: { payload: SessionHotkeyEvent }) => void | Promise<void>)
      | null = null;
    listenToTauriEvent.mockImplementation(async (_event, nextHandler) => {
      handler = nextHandler;
      return () => {};
    });

    const { result } = renderHook(() => useDictationSession());

    await vi.waitFor(() => expect(listenToTauriEvent).toHaveBeenCalled());
    expect(listenToTauriEvent).toHaveBeenCalledWith(
      "vaak://session-hotkey",
      expect.any(Function),
    );
    await act(async () => {
      await handler?.({
        payload: {
          error: null,
          field,
          mode: "dictation",
          phase: "start",
          shortcut: "Ctrl+Win",
        },
      });
    });

    expect(startRecording).toHaveBeenCalledTimes(1);
    expect(result.current.activeMode).toBe("dictation");
    expect(result.current.focusedField).toEqual(field);
  });

  it("stops recording 250ms after a dictation hotkey stop arrives", async () => {
    vi.useFakeTimers();
    setWindowsPlatform();
    useAvailableMicrophone();
    isTauriRuntime.mockReturnValue(true);
    let handler:
      | ((event: { payload: SessionHotkeyEvent }) => void | Promise<void>)
      | null = null;
    listenToTauriEvent.mockImplementation(async (_event, nextHandler) => {
      handler = nextHandler;
      return () => {};
    });

    const { result } = renderHook(() => useDictationSession());

    await vi.waitFor(() => expect(listenToTauriEvent).toHaveBeenCalled());
    await act(async () => {
      await handler?.({
        payload: {
          error: null,
          field: null,
          mode: "dictation",
          phase: "stop",
          shortcut: "Ctrl+Win",
        },
      });
    });

    expect(stopRecording).not.toHaveBeenCalled();
    expect(result.current.activeMode).toBe("idle");
    expect(result.current.completedMode).toBe("dictation");

    await act(async () => {
      vi.advanceTimersByTime(249);
    });
    expect(stopRecording).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(stopRecording).toHaveBeenCalledTimes(1);
    expect(result.current.activeMode).toBe("idle");
    expect(result.current.completedMode).toBe("dictation");
  });

  it("remembers that a command hotkey stop produced command audio", async () => {
    vi.useFakeTimers();
    setWindowsPlatform();
    useAvailableMicrophone();
    isTauriRuntime.mockReturnValue(true);
    let handler:
      | ((event: { payload: SessionHotkeyEvent }) => void | Promise<void>)
      | null = null;
    listenToTauriEvent.mockImplementation(async (_event, nextHandler) => {
      handler = nextHandler;
      return () => {};
    });

    const { result } = renderHook(() => useDictationSession());

    await vi.waitFor(() => expect(listenToTauriEvent).toHaveBeenCalled());
    await act(async () => {
      await handler?.({
        payload: {
          error: null,
          field: null,
          mode: "command",
          phase: "start",
          shortcut: "Ctrl+Win+Alt",
        },
      });
    });
    await act(async () => {
      await handler?.({
        payload: {
          error: null,
          field: null,
          mode: "command",
          phase: "stop",
          shortcut: "Ctrl+Win+Alt",
        },
      });
    });

    expect(stopRecording).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(stopRecording).toHaveBeenCalledTimes(1);
    expect(result.current.activeMode).toBe("idle");
    expect(result.current.completedMode).toBe("command");
  });

  it("shows a focus error when the hotkey starts without a writable target", async () => {
    setWindowsPlatform();
    useAvailableMicrophone();
    isTauriRuntime.mockReturnValue(true);
    let handler:
      | ((event: { payload: SessionHotkeyEvent }) => void | Promise<void>)
      | null = null;
    listenToTauriEvent.mockImplementation(async (_event, nextHandler) => {
      handler = nextHandler;
      return () => {};
    });

    const { result } = renderHook(() => useDictationSession());

    await vi.waitFor(() => expect(listenToTauriEvent).toHaveBeenCalled());
    await act(async () => {
      await handler?.({
        payload: {
          error: "No writable text field found for dictation.",
          field: null,
          mode: "dictation",
          phase: "start",
          shortcut: "Ctrl+Win",
        },
      });
    });

    expect(startRecording).not.toHaveBeenCalled();
    expect(result.current.activeMode).toBe("dictation");
    expect(result.current.focusedFieldError).toBe(
      "No writable text field found for dictation.",
    );
  });
});
