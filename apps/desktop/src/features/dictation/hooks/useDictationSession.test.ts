import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useMicrophoneSelection } from "@/hooks/useMicrophoneSelection";
import type { SessionHotkeyEvent } from "@/lib/tauri";

import { useDictationSession } from "./useDictationSession";

const {
  captureDictationTarget,
  cleanupAssemblyAiStreamingSessions,
  getFocusedField,
  getHotkeyBindings,
  getSelectedSpeechProvider,
  getSystemSettings,
  isTauriRuntime,
  listenToTauriEvent,
  sendAssemblyAiStreamingAudio,
  startAssemblyAiStreamingSession,
  stopAssemblyAiStreamingSession,
} = vi.hoisted(() => ({
    captureDictationTarget: vi.fn(),
    cleanupAssemblyAiStreamingSessions: vi.fn(),
    getFocusedField: vi.fn(),
    getHotkeyBindings: vi.fn(),
    getSelectedSpeechProvider: vi.fn(),
    getSystemSettings: vi.fn(),
    isTauriRuntime: vi.fn(),
    listenToTauriEvent: vi.fn(),
    sendAssemblyAiStreamingAudio: vi.fn(),
    startAssemblyAiStreamingSession: vi.fn(),
    stopAssemblyAiStreamingSession: vi.fn(),
  }));

vi.mock("@/hooks/useAudioRecorder", () => ({
  useAudioRecorder: vi.fn(),
}));

vi.mock("@/hooks/useMicrophoneSelection", () => ({
  useMicrophoneSelection: vi.fn(),
}));

vi.mock("@/lib/tauri", () => ({
  SPEECH_PROVIDER_CHANGED_EVENT: "vaak://speech-provider-changed",
  SYSTEM_SETTINGS_CHANGED_EVENT: "vaak://system-settings-changed",
  captureDictationTarget,
  cleanupAssemblyAiStreamingSessions,
  getFocusedField,
  getHotkeyBindings,
  getSelectedSpeechProvider,
  getSystemSettings,
  isTauriRuntime,
  listenToTauriEvent,
  sendAssemblyAiStreamingAudio,
  startAssemblyAiStreamingSession,
  stopAssemblyAiStreamingSession,
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
    captureDictationTarget.mockReset();
    getFocusedField.mockReset();
    getHotkeyBindings.mockReset();
    getSystemSettings.mockReset();
    isTauriRuntime.mockReset();
    listenToTauriEvent.mockReset();
    captureDictationTarget.mockResolvedValue(field);
    getFocusedField.mockResolvedValue(field);
    getHotkeyBindings.mockResolvedValue({
      command: "Ctrl+Win+Alt",
      dictation: "Ctrl+Win",
    });
    getSelectedSpeechProvider.mockResolvedValue("openai");
    getSystemSettings.mockResolvedValue({
      dictationMode: "auto",
      launchOnStartup: true,
      showSkippedTranscripts: false,
    });
    isTauriRuntime.mockReturnValue(false);
    listenToTauriEvent.mockResolvedValue(() => {});
    sendAssemblyAiStreamingAudio.mockResolvedValue({
      bytesSent: 0,
      droppedFrames: 0,
      frameCount: 0,
    });
    startAssemblyAiStreamingSession.mockResolvedValue({
      modelId: "u3-rt-pro",
      providerEvents: [],
      providerId: "assemblyai",
      providerMode: "streaming",
    });
    stopAssemblyAiStreamingSession.mockResolvedValue(true);
    cleanupAssemblyAiStreamingSessions.mockResolvedValue(false);
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

    expect(useAudioRecorder).toHaveBeenCalledWith(
      expect.objectContaining({
        microphoneSelection: { mode: "manual", deviceId: "usb-mic" },
        onPcm16Chunk: expect.any(Function),
      }),
    );
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

  it("starts AssemblyAI streaming only after speech-like pcm and stores final text", async () => {
    useAvailableMicrophone();
    getSelectedSpeechProvider.mockResolvedValue("assemblyai");
    let recorderOptions: Parameters<typeof useAudioRecorder>[0] | undefined;
    let onStreamingEvent:
      | Parameters<typeof startAssemblyAiStreamingSession>[0]["onEvent"]
      | undefined;
    vi.mocked(useAudioRecorder).mockImplementation((options) => {
      recorderOptions = options;
      return {
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
        status: "recording",
        stop: stopRecording,
        startupMetrics: null,
      };
    });
    startAssemblyAiStreamingSession.mockImplementation(async ({ onEvent }) => {
      onStreamingEvent = onEvent;
      return {
        modelId: "u3-rt-pro",
        providerEvents: [],
        providerId: "assemblyai",
        providerMode: "streaming",
      };
    });

    const { result } = renderHook(() => useDictationSession());

    await waitFor(() => expect(getSelectedSpeechProvider).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array([0, 0, 1, 0]), 16000);
    });
    expect(startAssemblyAiStreamingSession).not.toHaveBeenCalled();

    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array([0, 0, 0, 64]), 16000);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(startAssemblyAiStreamingSession).toHaveBeenCalledTimes(1);
    });
    expect(sendAssemblyAiStreamingAudio).toHaveBeenCalledWith(
      new Uint8Array([0, 0, 0, 64]),
    );

    act(() => {
      onStreamingEvent?.({
        eventType: "partial",
        providerEvents: [],
        text: "draft",
      });
    });
    expect(result.current.streamingTranscript).toBeNull();

    act(() => {
      onStreamingEvent?.({
        eventType: "final",
        providerEvents: [{ eventType: "stream_final_received" } as never],
        text: "final text",
      });
    });

    expect(result.current.streamingTranscript).toBe("final text");
    expect(result.current.streamingProviderEvents).toHaveLength(1);
  });

  it("does not start AssemblyAI streaming when standard mode is selected", async () => {
    useAvailableMicrophone();
    getSelectedSpeechProvider.mockResolvedValue("assemblyai");
    getSystemSettings.mockResolvedValue({
      dictationMode: "standard",
      launchOnStartup: true,
      showSkippedTranscripts: false,
    });
    let recorderOptions: Parameters<typeof useAudioRecorder>[0] | undefined;
    vi.mocked(useAudioRecorder).mockImplementation((options) => {
      recorderOptions = options;
      return {
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
        status: "recording",
        stop: stopRecording,
        startupMetrics: null,
      };
    });

    renderHook(() => useDictationSession());

    await waitFor(() => expect(getSystemSettings).toHaveBeenCalled());
    startAssemblyAiStreamingSession.mockClear();
    sendAssemblyAiStreamingAudio.mockClear();
    act(() => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array([0, 0, 0, 64]), 16000);
    });

    expect(startAssemblyAiStreamingSession).not.toHaveBeenCalled();
    expect(sendAssemblyAiStreamingAudio).not.toHaveBeenCalled();
  });

  it("captures AssemblyAI streaming audio write failures without an unhandled rejection", async () => {
    useAvailableMicrophone();
    getSelectedSpeechProvider.mockResolvedValue("assemblyai");
    let recorderOptions: Parameters<typeof useAudioRecorder>[0] | undefined;
    vi.mocked(useAudioRecorder).mockImplementation((options) => {
      recorderOptions = options;
      return {
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
        status: "recording",
        stop: stopRecording,
        startupMetrics: null,
      };
    });
    sendAssemblyAiStreamingAudio.mockRejectedValueOnce({
      code: "invalid_provider_request",
      message: "no active AssemblyAI streaming session",
    });

    const { result } = renderHook(() => useDictationSession());

    await waitFor(() => expect(getSelectedSpeechProvider).toHaveBeenCalled());
    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array([0, 0, 0, 64]), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.streamingError).toBe(
        "invalid_provider_request: no active AssemblyAI streaming session",
      );
    });
  });

  it("starts verification recording without a writable target when processing is disabled", async () => {
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

    const { result } = renderHook(() =>
      useDictationSession({ processingEnabled: false }),
    );

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

    expect(captureDictationTarget).not.toHaveBeenCalled();
    expect(startRecording).toHaveBeenCalledTimes(1);
    expect(result.current.activeMode).toBe("dictation");
    expect(result.current.focusedFieldError).toBeNull();
  });
});
