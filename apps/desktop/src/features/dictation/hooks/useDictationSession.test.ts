import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useMicrophoneSelection } from "@/hooks/useMicrophoneSelection";
import type { MicrophoneSelection } from "@/hooks/useMicrophoneSelection";
import type { SessionHotkeyEvent } from "@/lib/tauri";

import { useDictationSession } from "./useDictationSession";

const {
  captureDictationTarget,
  cleanupAssemblyAiStreamingSessions,
  cleanupDeepgramStreamingSessions,
  cleanupElevenLabsStreamingSessions,
  cleanupSmallestStreamingSessions,
  getFocusedField,
  getHotkeyBindings,
  getSelectedSpeechProvider,
  getSystemSettings,
  isTauriRuntime,
  listenToTauriEvent,
  sendAssemblyAiStreamingAudio,
  sendDeepgramStreamingAudio,
  sendElevenLabsStreamingAudio,
  sendSmallestStreamingAudio,
  startAssemblyAiStreamingSession,
  startDeepgramStreamingSession,
  startElevenLabsStreamingSession,
  startSmallestStreamingSession,
  stopAssemblyAiStreamingSession,
  stopDeepgramStreamingSession,
  stopElevenLabsStreamingSession,
  stopSmallestStreamingSession,
} = vi.hoisted(() => ({
    captureDictationTarget: vi.fn(),
    cleanupAssemblyAiStreamingSessions: vi.fn(),
    cleanupDeepgramStreamingSessions: vi.fn(),
    cleanupElevenLabsStreamingSessions: vi.fn(),
    cleanupSmallestStreamingSessions: vi.fn(),
    getFocusedField: vi.fn(),
    getHotkeyBindings: vi.fn(),
    getSelectedSpeechProvider: vi.fn(),
    getSystemSettings: vi.fn(),
    isTauriRuntime: vi.fn(),
    listenToTauriEvent: vi.fn(),
    sendAssemblyAiStreamingAudio: vi.fn(),
    sendDeepgramStreamingAudio: vi.fn(),
    sendElevenLabsStreamingAudio: vi.fn(),
    sendSmallestStreamingAudio: vi.fn(),
    startAssemblyAiStreamingSession: vi.fn(),
    startDeepgramStreamingSession: vi.fn(),
    startElevenLabsStreamingSession: vi.fn(),
    startSmallestStreamingSession: vi.fn(),
    stopAssemblyAiStreamingSession: vi.fn(),
    stopDeepgramStreamingSession: vi.fn(),
    stopElevenLabsStreamingSession: vi.fn(),
    stopSmallestStreamingSession: vi.fn(),
  }));

vi.mock("@/hooks/useAudioRecorder", () => ({
  useAudioRecorder: vi.fn(),
}));

vi.mock("@/hooks/useMicrophoneSelection", () => ({
  useMicrophoneSelection: vi.fn(),
}));

const analytics = vi.hoisted(() => ({
  capture: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock("@/lib/analytics/browser", () => ({
  analytics,
}));

vi.mock("@/lib/tauri", () => ({
  SPEECH_PROVIDER_CHANGED_EVENT: "vaak://speech-provider-changed",
  SYSTEM_SETTINGS_CHANGED_EVENT: "vaak://system-settings-changed",
  captureDictationTarget,
  cleanupAssemblyAiStreamingSessions,
  cleanupDeepgramStreamingSessions,
  cleanupElevenLabsStreamingSessions,
  cleanupSmallestStreamingSessions,
  getFocusedField,
  getHotkeyBindings,
  getSelectedSpeechProvider,
  getSystemSettings,
  isTauriRuntime,
  listenToTauriEvent,
  sendAssemblyAiStreamingAudio,
  sendDeepgramStreamingAudio,
  sendElevenLabsStreamingAudio,
  sendSmallestStreamingAudio,
  startAssemblyAiStreamingSession,
  startDeepgramStreamingSession,
  startElevenLabsStreamingSession,
  startSmallestStreamingSession,
  stopAssemblyAiStreamingSession,
  stopDeepgramStreamingSession,
  stopElevenLabsStreamingSession,
  stopSmallestStreamingSession,
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

function setMacPlatform() {
  Object.defineProperty(navigator, "platform", {
    configurable: true,
    value: "MacIntel",
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
    getSelectedSpeechProvider.mockReset();
    isTauriRuntime.mockReset();
    listenToTauriEvent.mockReset();
    sendAssemblyAiStreamingAudio.mockReset();
    sendDeepgramStreamingAudio.mockReset();
    sendElevenLabsStreamingAudio.mockReset();
    sendSmallestStreamingAudio.mockReset();
    startAssemblyAiStreamingSession.mockReset();
    startDeepgramStreamingSession.mockReset();
    startElevenLabsStreamingSession.mockReset();
    startSmallestStreamingSession.mockReset();
    stopAssemblyAiStreamingSession.mockReset();
    stopDeepgramStreamingSession.mockReset();
    stopElevenLabsStreamingSession.mockReset();
    stopSmallestStreamingSession.mockReset();
    cleanupAssemblyAiStreamingSessions.mockReset();
    cleanupDeepgramStreamingSessions.mockReset();
    cleanupElevenLabsStreamingSessions.mockReset();
    cleanupSmallestStreamingSessions.mockReset();
    captureDictationTarget.mockResolvedValue(field);
    getFocusedField.mockResolvedValue(field);
    getHotkeyBindings.mockResolvedValue({
      command: "Ctrl+Win+Alt",
      dictation: "Ctrl+Win",
    });
    getSelectedSpeechProvider.mockResolvedValue("openai");
    getSystemSettings.mockResolvedValue({
      dictationMode: "streaming",
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
    sendDeepgramStreamingAudio.mockResolvedValue({
      bytesSent: 0,
      droppedFrames: 0,
      frameCount: 0,
    });
    sendElevenLabsStreamingAudio.mockResolvedValue({
      bytesSent: 0,
      droppedFrames: 0,
      frameCount: 0,
    });
    sendSmallestStreamingAudio.mockResolvedValue({
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
    startDeepgramStreamingSession.mockResolvedValue({
      modelId: "nova-3",
      providerEvents: [],
      providerId: "deepgram",
      providerMode: "streaming",
    });
    startElevenLabsStreamingSession.mockResolvedValue({
      modelId: "scribe_v2_realtime",
      providerEvents: [],
      providerId: "elevenlabs",
      providerMode: "streaming",
    });
    startSmallestStreamingSession.mockResolvedValue({
      modelId: "pulse",
      providerEvents: [],
      providerId: "smallest",
      providerMode: "streaming",
    });
    stopAssemblyAiStreamingSession.mockResolvedValue(true);
    stopDeepgramStreamingSession.mockResolvedValue(true);
    stopElevenLabsStreamingSession.mockResolvedValue(true);
    stopSmallestStreamingSession.mockResolvedValue(true);
    cleanupAssemblyAiStreamingSessions.mockResolvedValue(false);
    cleanupDeepgramStreamingSessions.mockResolvedValue(false);
    cleanupElevenLabsStreamingSessions.mockResolvedValue(false);
    cleanupSmallestStreamingSessions.mockResolvedValue(false);
    startRecording.mockReset();
    stopRecording.mockReset();
    prepareRecording.mockReset();
    analytics.capture.mockReset();
    analytics.captureError.mockReset();
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
    expect(analytics.capture).toHaveBeenCalledWith("dictation_attempted", {
      trigger: "manual",
    });
    expect(analytics.capture).toHaveBeenCalledWith("dictation_failed", {
      error_code: "microphone_unavailable",
      error_stage: "recording",
      provider_id: "openai",
      trigger: "manual",
    });
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

  it("captures an asynchronous recorder error once for the active attempt", async () => {
    useAvailableMicrophone();
    let recorderError: string | null = null;
    vi.mocked(useAudioRecorder).mockImplementation(() => ({
      activeMicrophone: null,
      audioBlob: null,
      audioLevel: 0,
      audioUrl: null,
      captureAnalysis: null,
      elapsedMs: 0,
      error: recorderError,
      prepare: prepareRecording,
      reset: vi.fn(),
      start: startRecording,
      status: recorderError ? "error" : "idle",
      stop: stopRecording,
      startupMetrics: null,
    }));

    const { result, rerender } = renderHook(() => useDictationSession());

    await act(async () => {
      await result.current.startManualDictation();
    });

    recorderError = "Microphone stream ended.";
    rerender();
    rerender();

    await waitFor(() => {
      expect(analytics.capture).toHaveBeenCalledWith("dictation_failed", {
        error_code: "recording_failed",
        error_stage: "recording",
        provider_id: "openai",
        trigger: "manual",
      });
    });
    expect(
      analytics.capture.mock.calls.filter(
        ([eventName]) => eventName === "dictation_failed",
      ),
    ).toHaveLength(1);
  });

  it("does not apply captured focus state after being disabled mid-start", async () => {
    useAvailableMicrophone();
    let resolveFocusCapture: ((value: typeof field) => void) | undefined;
    captureDictationTarget.mockReturnValue(
      new Promise<typeof field>((resolve) => {
        resolveFocusCapture = resolve;
      }),
    );

    const { result, rerender } = renderHook(
      ({ enabled }) => useDictationSession({ enabled }),
      { initialProps: { enabled: true } },
    );

    const manualStart = result.current.startManualDictation();
    await waitFor(() => expect(captureDictationTarget).toHaveBeenCalledTimes(1));

    rerender({ enabled: false });
    await act(async () => {
      resolveFocusCapture?.(field);
      await manualStart;
    });

    expect(result.current.activeMode).toBe("idle");
    expect(result.current.focusedField).toBeNull();
    expect(result.current.focusedFieldError).toBeNull();
  });

  it("cleans up stale backend streaming sessions before starting a new manual dictation", async () => {
    useAvailableMicrophone();
    getSelectedSpeechProvider.mockResolvedValue("smallest");

    const { result } = renderHook(() => useDictationSession());

    await act(async () => {
      await result.current.startManualDictation();
    });

    expect(cleanupAssemblyAiStreamingSessions).toHaveBeenCalledTimes(1);
    expect(cleanupDeepgramStreamingSessions).toHaveBeenCalledTimes(1);
    expect(cleanupElevenLabsStreamingSessions).toHaveBeenCalledTimes(1);
    expect(cleanupSmallestStreamingSessions).toHaveBeenCalledTimes(1);
    expect(startRecording).toHaveBeenCalledTimes(1);
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

  it("loads bindings and subscribes to hotkey events on macOS desktop builds", async () => {
    setMacPlatform();
    useAvailableMicrophone();
    isTauriRuntime.mockReturnValue(true);
    getHotkeyBindings.mockResolvedValue({
      command: "Control+Command+Option",
      dictation: "Control+Command",
    });

    const { result } = renderHook(() => useDictationSession());

    await vi.waitFor(() => expect(getHotkeyBindings).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(listenToTauriEvent).toHaveBeenCalledWith(
      "vaak://session-hotkey",
      expect.any(Function),
    ));
    expect(result.current.desktopHotkeysSupported).toBe(true);
    expect(result.current.isWindows).toBe(false);
    await vi.waitFor(() => {
      expect(result.current.hotkeyBindings).toEqual({
        command: "Control+Command+Option",
        dictation: "Control+Command",
      });
    });
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
    expect(analytics.capture).toHaveBeenCalledWith("dictation_attempted", {
      trigger: "hotkey",
    });
  });

  it("does not start recording when disabled during async hotkey startup", async () => {
    setWindowsPlatform();
    useAvailableMicrophone();
    isTauriRuntime.mockReturnValue(true);
    const registered: {
      handler:
        | ((event: { payload: SessionHotkeyEvent }) => void | Promise<void>)
        | null;
    } = { handler: null };
    let resolveCleanup: () => void = () => {};
    cleanupAssemblyAiStreamingSessions.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveCleanup = () => resolve(true);
      }),
    );
    listenToTauriEvent.mockImplementation(async (_event, nextHandler) => {
      registered.handler = nextHandler;
      return () => {};
    });

    const { result, rerender } = renderHook(
      ({ enabled }) => useDictationSession({ enabled }),
      { initialProps: { enabled: true } },
    );

    await vi.waitFor(() => expect(listenToTauriEvent).toHaveBeenCalled());
    if (!registered.handler) {
      throw new Error("Hotkey handler was not registered.");
    }
    const hotkeyStart = registered.handler({
      payload: {
        error: null,
        field,
        mode: "dictation",
        phase: "start",
        shortcut: "Ctrl+Win",
      },
    });
    await vi.waitFor(() =>
      expect(cleanupAssemblyAiStreamingSessions).toHaveBeenCalledTimes(1),
    );

    rerender({ enabled: false });
    await act(async () => {
      resolveCleanup();
      await hotkeyStart;
    });

    expect(startRecording).not.toHaveBeenCalled();
    expect(result.current.activeMode).toBe("idle");
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

  it("does not start command recording when disabled during async hotkey startup", async () => {
    setWindowsPlatform();
    useAvailableMicrophone();
    isTauriRuntime.mockReturnValue(true);
    const registered: {
      handler:
        | ((event: { payload: SessionHotkeyEvent }) => void | Promise<void>)
        | null;
    } = { handler: null };
    let resolveCleanup: () => void = () => {};
    cleanupAssemblyAiStreamingSessions.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveCleanup = () => resolve(true);
      }),
    );
    listenToTauriEvent.mockImplementation(async (_event, nextHandler) => {
      registered.handler = nextHandler;
      return () => {};
    });

    const { result, rerender } = renderHook(
      ({ enabled }) => useDictationSession({ enabled }),
      { initialProps: { enabled: true } },
    );

    await vi.waitFor(() => expect(listenToTauriEvent).toHaveBeenCalled());
    if (!registered.handler) {
      throw new Error("Hotkey handler was not registered.");
    }
    const hotkeyStart = registered.handler({
      payload: {
        error: null,
        field: null,
        mode: "command",
        phase: "start",
        shortcut: "Ctrl+Win+Alt",
      },
    });
    await vi.waitFor(() =>
      expect(cleanupAssemblyAiStreamingSessions).toHaveBeenCalledTimes(1),
    );

    rerender({ enabled: false });
    await act(async () => {
      resolveCleanup();
      await hotkeyStart;
    });

    expect(startRecording).not.toHaveBeenCalled();
    expect(result.current.activeMode).toBe("idle");
  });

  it("does not report a stale command recording error after being disabled mid-start", async () => {
    setWindowsPlatform();
    useAvailableMicrophone();
    isTauriRuntime.mockReturnValue(true);
    const registered: {
      handler:
        | ((event: { payload: SessionHotkeyEvent }) => void | Promise<void>)
        | null;
    } = { handler: null };
    let rejectStart: ((reason: unknown) => void) | undefined;
    startRecording.mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => {
        rejectStart = reject;
      }),
    );
    listenToTauriEvent.mockImplementation(async (_event, nextHandler) => {
      registered.handler = nextHandler;
      return () => {};
    });

    const { result, rerender } = renderHook(
      ({ enabled }) => useDictationSession({ enabled }),
      { initialProps: { enabled: true } },
    );

    await vi.waitFor(() => expect(listenToTauriEvent).toHaveBeenCalled());
    if (!registered.handler) {
      throw new Error("Hotkey handler was not registered.");
    }
    const hotkeyStart = registered.handler({
      payload: {
        error: null,
        field: null,
        mode: "command",
        phase: "start",
        shortcut: "Ctrl+Win+Alt",
      },
    });
    await waitFor(() => expect(startRecording).toHaveBeenCalledTimes(1));

    rerender({ enabled: false });
    await act(async () => {
      rejectStart?.(new Error("Microphone denied"));
      await hotkeyStart;
    });

    expect(result.current.activeMode).toBe("idle");
    expect(result.current.focusedFieldError).toBeNull();
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
    expect(analytics.capture).toHaveBeenCalledWith("dictation_attempted", {
      trigger: "hotkey",
    });
    expect(analytics.capture).toHaveBeenCalledWith("dictation_failed", {
      error_code: "focus_target_unavailable",
      error_stage: "focus",
      provider_id: "openai",
      trigger: "hotkey",
    });
  });

  it("starts AssemblyAI streaming with the first pcm chunk and stores final text", async () => {
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
    await act(async () => {
      const frame = new Uint8Array(1600);
      frame.set([0, 0, 1, 0]);
      recorderOptions?.onPcm16Chunk?.(frame, 16000);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(startAssemblyAiStreamingSession).toHaveBeenCalledTimes(1);
    });
    expect(sendAssemblyAiStreamingAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        byteLength: 1600,
      }),
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

  it("buffers AssemblyAI pcm into 1600-byte frames before sending over Tauri IPC", async () => {
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

    renderHook(() => useDictationSession());

    await waitFor(() => expect(getSelectedSpeechProvider).toHaveBeenCalled());
    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(800).fill(1), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(startAssemblyAiStreamingSession).toHaveBeenCalledTimes(1);
    expect(sendAssemblyAiStreamingAudio).not.toHaveBeenCalled();

    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(800).fill(2), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(sendAssemblyAiStreamingAudio).toHaveBeenCalledTimes(1));
    const sent = sendAssemblyAiStreamingAudio.mock.calls[0]?.[0];
    expect(sent).toBeInstanceOf(Uint8Array);
    expect(sent).toHaveLength(1600);
    expect(Array.from(sent?.slice(0, 800) ?? [])).toEqual(Array(800).fill(1));
    expect(Array.from(sent?.slice(800) ?? [])).toEqual(Array(800).fill(2));
  });

  it("keeps sending pcm to the active streaming provider when provider settings change mid-recording", async () => {
    useAvailableMicrophone();
    getSelectedSpeechProvider.mockResolvedValue("assemblyai");
    const eventHandlers = new Map<
      string,
      (event: { payload: unknown }) => void | Promise<void>
    >();
    listenToTauriEvent.mockImplementation(async (event, handler) => {
      eventHandlers.set(event, handler as (event: { payload: unknown }) => void);
      return () => {};
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

    await waitFor(() => expect(getSelectedSpeechProvider).toHaveBeenCalled());
    await waitFor(() =>
      expect(eventHandlers.has("vaak://speech-provider-changed")).toBe(true),
    );
    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(1600).fill(1), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(startAssemblyAiStreamingSession).toHaveBeenCalledTimes(1);
      expect(sendAssemblyAiStreamingAudio).toHaveBeenCalledTimes(1);
    });

    act(() => {
      eventHandlers.get("vaak://speech-provider-changed")?.({
        payload: "deepgram",
      });
    });
    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(3200).fill(2), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(startDeepgramStreamingSession).not.toHaveBeenCalled();
    expect(sendDeepgramStreamingAudio).not.toHaveBeenCalled();
    expect(sendAssemblyAiStreamingAudio).toHaveBeenCalledTimes(3);
    expect(sendAssemblyAiStreamingAudio.mock.calls[1]?.[0]).toHaveLength(1600);
    expect(sendAssemblyAiStreamingAudio.mock.calls[2]?.[0]).toHaveLength(1600);
  });

  it("buffers Smallest AI pcm into 4096-byte frames before sending over Tauri IPC", async () => {
    useAvailableMicrophone();
    getSelectedSpeechProvider.mockResolvedValue("smallest");
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

    await waitFor(() => expect(getSelectedSpeechProvider).toHaveBeenCalled());
    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(2048).fill(1), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(startSmallestStreamingSession).toHaveBeenCalledTimes(1);
    expect(sendSmallestStreamingAudio).not.toHaveBeenCalled();

    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(2048).fill(2), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(sendSmallestStreamingAudio).toHaveBeenCalledTimes(1));
    expect(sendAssemblyAiStreamingAudio).not.toHaveBeenCalled();
    const sent = sendSmallestStreamingAudio.mock.calls[0]?.[0];
    expect(sent).toBeInstanceOf(Uint8Array);
    expect(sent).toHaveLength(4096);
    expect(Array.from(sent?.slice(0, 2048) ?? [])).toEqual(Array(2048).fill(1));
    expect(Array.from(sent?.slice(2048) ?? [])).toEqual(Array(2048).fill(2));
  });

  it("buffers ElevenLabs pcm into 3200-byte frames before sending over Tauri IPC", async () => {
    useAvailableMicrophone();
    getSelectedSpeechProvider.mockResolvedValue("elevenlabs");
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

    await waitFor(() => expect(getSelectedSpeechProvider).toHaveBeenCalled());
    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(1600).fill(1), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(startElevenLabsStreamingSession).toHaveBeenCalledTimes(1);
    expect(sendElevenLabsStreamingAudio).not.toHaveBeenCalled();

    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(1600).fill(2), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(sendElevenLabsStreamingAudio).toHaveBeenCalledTimes(1));
    expect(sendAssemblyAiStreamingAudio).not.toHaveBeenCalled();
    expect(sendSmallestStreamingAudio).not.toHaveBeenCalled();
    const sent = sendElevenLabsStreamingAudio.mock.calls[0]?.[0];
    expect(sent).toBeInstanceOf(Uint8Array);
    expect(sent).toHaveLength(3200);
    expect(Array.from(sent?.slice(0, 1600) ?? [])).toEqual(Array(1600).fill(1));
    expect(Array.from(sent?.slice(1600) ?? [])).toEqual(Array(1600).fill(2));
  });

  it("buffers Deepgram pcm into 3200-byte frames before sending over Tauri IPC", async () => {
    useAvailableMicrophone();
    getSelectedSpeechProvider.mockResolvedValue("deepgram");
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

    await waitFor(() => expect(getSelectedSpeechProvider).toHaveBeenCalled());
    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(1600).fill(1), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(startDeepgramStreamingSession).toHaveBeenCalledTimes(1);
    expect(sendDeepgramStreamingAudio).not.toHaveBeenCalled();

    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(1600).fill(2), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(sendDeepgramStreamingAudio).toHaveBeenCalledTimes(1));
    expect(sendAssemblyAiStreamingAudio).not.toHaveBeenCalled();
    expect(sendElevenLabsStreamingAudio).not.toHaveBeenCalled();
    expect(sendSmallestStreamingAudio).not.toHaveBeenCalled();
    const sent = sendDeepgramStreamingAudio.mock.calls[0]?.[0];
    expect(sent).toBeInstanceOf(Uint8Array);
    expect(sent).toHaveLength(3200);
    expect(Array.from(sent?.slice(0, 1600) ?? [])).toEqual(Array(1600).fill(1));
    expect(Array.from(sent?.slice(1600) ?? [])).toEqual(Array(1600).fill(2));
  });

  it("flushes a padded AssemblyAI pcm frame before stopping streaming", async () => {
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

    const { result } = renderHook(() => useDictationSession());

    await waitFor(() => expect(getSelectedSpeechProvider).toHaveBeenCalled());
    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array([9, 8, 7, 6]), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });
    sendAssemblyAiStreamingAudio.mockClear();
    stopAssemblyAiStreamingSession.mockClear();
    stopRecording.mockImplementationOnce(() => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array([5, 4]), 16000);
    });

    await act(async () => {
      result.current.stopManualRecording();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sendAssemblyAiStreamingAudio).toHaveBeenCalledTimes(1);
    const sent = sendAssemblyAiStreamingAudio.mock.calls[0]?.[0];
    expect(sent).toHaveLength(1600);
    expect(Array.from(sent?.slice(0, 6) ?? [])).toEqual([9, 8, 7, 6, 5, 4]);
    expect(Array.from(sent?.slice(6) ?? [])).toEqual(Array(1594).fill(0));
    expect(stopAssemblyAiStreamingSession).toHaveBeenCalledTimes(1);
  });

  it("ignores stale streaming stop failures after the session is disabled", async () => {
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
    let rejectStreamingStop: ((reason: unknown) => void) | undefined;
    stopAssemblyAiStreamingSession.mockReturnValueOnce(
      new Promise<boolean>((_, reject) => {
        rejectStreamingStop = reject;
      }),
    );

    const { result, rerender } = renderHook(
      ({ enabled }) => useDictationSession({ enabled }),
      { initialProps: { enabled: true } },
    );

    await waitFor(() => expect(getSelectedSpeechProvider).toHaveBeenCalled());
    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(1600), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(startAssemblyAiStreamingSession).toHaveBeenCalledTimes(1);
      expect(sendAssemblyAiStreamingAudio).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.stopManualRecording();
    });
    await waitFor(() =>
      expect(stopAssemblyAiStreamingSession).toHaveBeenCalledTimes(1),
    );

    rerender({ enabled: false });
    await act(async () => {
      rejectStreamingStop?.(new Error("stale streaming stop failed"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.streamingError).toBeNull();
  });

  it("stops the active streaming session before restarting after microphone selection changes", async () => {
    getSelectedSpeechProvider.mockResolvedValue("assemblyai");
    let microphoneSelection: MicrophoneSelection = { mode: "system" };
    vi.mocked(useMicrophoneSelection).mockImplementation(() => ({
      activeMicrophone: null,
      devices: [
        { deviceId: "system", label: "System microphone" },
        { deviceId: "usb-mic", label: "USB microphone" },
      ],
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
      selection: microphoneSelection,
    }));
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

    const { rerender } = renderHook(() => useDictationSession());

    await waitFor(() => expect(getSelectedSpeechProvider).toHaveBeenCalled());
    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(1600), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(startAssemblyAiStreamingSession).toHaveBeenCalledTimes(1);
    });
    stopAssemblyAiStreamingSession.mockClear();

    microphoneSelection = { mode: "manual", deviceId: "usb-mic" };
    rerender();

    await waitFor(() => {
      expect(stopRecording).toHaveBeenCalledTimes(1);
    });
    expect(stopAssemblyAiStreamingSession).toHaveBeenCalledTimes(1);
  });

  it("starts a fresh streaming session after restarting for a microphone selection change", async () => {
    getSelectedSpeechProvider.mockResolvedValue("assemblyai");
    let microphoneSelection: MicrophoneSelection = { mode: "system" };
    let recorderStatus: "idle" | "recording" | "stopped" | "error" =
      "recording";
    vi.mocked(useMicrophoneSelection).mockImplementation(() => ({
      activeMicrophone: null,
      devices: [
        { deviceId: "system", label: "System microphone" },
        { deviceId: "usb-mic", label: "USB microphone" },
      ],
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
      selection: microphoneSelection,
    }));
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
        status: recorderStatus,
        stop: stopRecording,
        startupMetrics: null,
      };
    });

    const { rerender } = renderHook(() => useDictationSession());

    await waitFor(() => expect(getSelectedSpeechProvider).toHaveBeenCalled());
    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(1600), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(startAssemblyAiStreamingSession).toHaveBeenCalledTimes(1);
    });

    microphoneSelection = { mode: "manual", deviceId: "usb-mic" };
    rerender();
    await waitFor(() => {
      expect(stopAssemblyAiStreamingSession).toHaveBeenCalledTimes(1);
      expect(stopRecording).toHaveBeenCalledTimes(1);
    });

    recorderStatus = "stopped";
    rerender();
    await waitFor(() => {
      expect(startRecording).toHaveBeenCalledTimes(1);
    });

    recorderStatus = "recording";
    rerender();
    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(1600), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(startAssemblyAiStreamingSession).toHaveBeenCalledTimes(2);
  });

  it("does not send restarted microphone audio to the stale streaming session while stop is pending", async () => {
    getSelectedSpeechProvider.mockResolvedValue("assemblyai");
    let microphoneSelection: MicrophoneSelection = { mode: "system" };
    let recorderStatus: "idle" | "recording" | "stopped" | "error" =
      "recording";
    let resolveStreamingStop: ((value: boolean) => void) | null = null;
    stopAssemblyAiStreamingSession.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveStreamingStop = resolve;
        }),
    );
    vi.mocked(useMicrophoneSelection).mockImplementation(() => ({
      activeMicrophone: null,
      devices: [
        { deviceId: "system", label: "System microphone" },
        { deviceId: "usb-mic", label: "USB microphone" },
      ],
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
      selection: microphoneSelection,
    }));
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
        status: recorderStatus,
        stop: stopRecording,
        startupMetrics: null,
      };
    });

    const { rerender } = renderHook(() => useDictationSession());

    await waitFor(() => expect(getSelectedSpeechProvider).toHaveBeenCalled());
    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(1600), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(startAssemblyAiStreamingSession).toHaveBeenCalledTimes(1);
      expect(sendAssemblyAiStreamingAudio).toHaveBeenCalledTimes(1);
    });

    microphoneSelection = { mode: "manual", deviceId: "usb-mic" };
    rerender();
    await waitFor(() => {
      expect(stopAssemblyAiStreamingSession).toHaveBeenCalledTimes(1);
      expect(stopRecording).toHaveBeenCalledTimes(1);
    });

    recorderStatus = "stopped";
    rerender();
    await waitFor(() => {
      expect(startRecording).toHaveBeenCalledTimes(1);
    });

    recorderStatus = "recording";
    rerender();
    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(1600), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(startAssemblyAiStreamingSession).toHaveBeenCalledTimes(2);
    expect(sendAssemblyAiStreamingAudio).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveStreamingStop?.(true);
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it("ignores stale streaming startup completion after a microphone restart", async () => {
    getSelectedSpeechProvider.mockResolvedValue("assemblyai");
    let microphoneSelection: MicrophoneSelection = { mode: "system" };
    let recorderStatus: "idle" | "recording" | "stopped" | "error" =
      "recording";
    let resolveStreamingStart:
      | ((value: { providerEvents: [] }) => void)
      | null = null;
    startAssemblyAiStreamingSession.mockImplementationOnce(
      () =>
        new Promise<{ providerEvents: [] }>((resolve) => {
          resolveStreamingStart = resolve;
        }),
    );
    vi.mocked(useMicrophoneSelection).mockImplementation(() => ({
      activeMicrophone: null,
      devices: [
        { deviceId: "system", label: "System microphone" },
        { deviceId: "usb-mic", label: "USB microphone" },
      ],
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
      selection: microphoneSelection,
    }));
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
        status: recorderStatus,
        stop: stopRecording,
        startupMetrics: null,
      };
    });

    const { rerender } = renderHook(() => useDictationSession());

    await waitFor(() => expect(getSelectedSpeechProvider).toHaveBeenCalled());
    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(1600), 16000);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(startAssemblyAiStreamingSession).toHaveBeenCalledTimes(1);
    });

    microphoneSelection = { mode: "manual", deviceId: "usb-mic" };
    rerender();
    await waitFor(() => {
      expect(stopAssemblyAiStreamingSession).toHaveBeenCalledTimes(1);
      expect(stopRecording).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      resolveStreamingStart?.({ providerEvents: [] });
      await Promise.resolve();
      await Promise.resolve();
    });
    recorderStatus = "stopped";
    rerender();
    await waitFor(() => {
      expect(startRecording).toHaveBeenCalledTimes(1);
    });

    recorderStatus = "recording";
    rerender();
    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(1600), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(startAssemblyAiStreamingSession).toHaveBeenCalledTimes(2);
  });

  it("accumulates finalized AssemblyAI streaming turns in order", async () => {
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
      recorderOptions?.onPcm16Chunk?.(new Uint8Array([0, 0, 0, 0]), 16000);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(startAssemblyAiStreamingSession).toHaveBeenCalledTimes(1);
    });

    act(() => {
      onStreamingEvent?.({
        eventType: "final",
        providerEvents: [],
        text: "first sentence",
        turnOrder: 0,
      });
      onStreamingEvent?.({
        eventType: "final",
        providerEvents: [],
        text: "second sentence",
        turnOrder: 1,
      });
    });

    expect(result.current.streamingTranscript).toBe(
      "first sentence second sentence",
    );
  });

  it("accumulates finalized Smallest AI streaming sequences in order", async () => {
    useAvailableMicrophone();
    getSelectedSpeechProvider.mockResolvedValue("smallest");
    let recorderOptions: Parameters<typeof useAudioRecorder>[0] | undefined;
    let onStreamingEvent:
      | Parameters<typeof startSmallestStreamingSession>[0]["onEvent"]
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
    startSmallestStreamingSession.mockImplementation(async ({ onEvent }) => {
      onStreamingEvent = onEvent;
      return {
        modelId: "pulse",
        providerEvents: [],
        providerId: "smallest",
        providerMode: "streaming",
      };
    });

    const { result } = renderHook(() => useDictationSession());

    await waitFor(() => expect(getSelectedSpeechProvider).toHaveBeenCalled());
    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(4096), 16000);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(startSmallestStreamingSession).toHaveBeenCalledTimes(1);
    });

    act(() => {
      onStreamingEvent?.({
        eventType: "final",
        providerEvents: [],
        sequence: 1,
        text: "second sentence",
      });
      onStreamingEvent?.({
        eventType: "final",
        providerEvents: [],
        sequence: 0,
        text: "first sentence",
      });
    });

    expect(result.current.streamingTranscript).toBe(
      "first sentence second sentence",
    );
  });

  it("accumulates finalized ElevenLabs streaming sequences in receive order", async () => {
    useAvailableMicrophone();
    getSelectedSpeechProvider.mockResolvedValue("elevenlabs");
    let recorderOptions: Parameters<typeof useAudioRecorder>[0] | undefined;
    let onStreamingEvent:
      | Parameters<typeof startElevenLabsStreamingSession>[0]["onEvent"]
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
    startElevenLabsStreamingSession.mockImplementation(async ({ onEvent }) => {
      onStreamingEvent = onEvent;
      return {
        modelId: "scribe_v2_realtime",
        providerEvents: [],
        providerId: "elevenlabs",
        providerMode: "streaming",
      };
    });

    const { result } = renderHook(() => useDictationSession());

    await waitFor(() => expect(getSelectedSpeechProvider).toHaveBeenCalled());
    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(3200), 16000);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(startElevenLabsStreamingSession).toHaveBeenCalledTimes(1);
    });

    act(() => {
      onStreamingEvent?.({
        eventType: "final",
        providerEvents: [],
        sequence: 0,
        text: "first sentence",
      });
      onStreamingEvent?.({
        eventType: "final",
        providerEvents: [],
        sequence: 1,
        text: "second sentence",
      });
    });

    expect(result.current.streamingTranscript).toBe(
      "first sentence second sentence",
    );
  });

  it("accumulates finalized Deepgram streaming sequences in receive order", async () => {
    useAvailableMicrophone();
    getSelectedSpeechProvider.mockResolvedValue("deepgram");
    let recorderOptions: Parameters<typeof useAudioRecorder>[0] | undefined;
    let onStreamingEvent:
      | Parameters<typeof startDeepgramStreamingSession>[0]["onEvent"]
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
    startDeepgramStreamingSession.mockImplementation(async ({ onEvent }) => {
      onStreamingEvent = onEvent;
      return {
        modelId: "nova-3",
        providerEvents: [],
        providerId: "deepgram",
        providerMode: "streaming",
      };
    });

    const { result } = renderHook(() => useDictationSession());

    await waitFor(() => expect(getSelectedSpeechProvider).toHaveBeenCalled());
    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(3200), 16000);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(startDeepgramStreamingSession).toHaveBeenCalledTimes(1);
    });

    act(() => {
      onStreamingEvent?.({
        eventType: "final",
        providerEvents: [],
        sequence: 0,
        text: "first sentence",
      });
      onStreamingEvent?.({
        eventType: "final",
        providerEvents: [],
        sequence: 1,
        text: "second sentence",
      });
    });

    expect(result.current.streamingTranscript).toBe(
      "first sentence second sentence",
    );
  });

  it("replaces duplicate finalized AssemblyAI turn variants instead of duplicating text", async () => {
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
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(1600), 16000);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(startAssemblyAiStreamingSession).toHaveBeenCalledTimes(1);
    });

    act(() => {
      onStreamingEvent?.({
        eventType: "final",
        providerEvents: [],
        text: "unformatted text",
        turnOrder: 0,
      });
      onStreamingEvent?.({
        eventType: "final",
        providerEvents: [],
        text: "Formatted text.",
        turnOrder: 0,
      });
    });

    expect(result.current.streamingTranscript).toBe("Formatted text.");
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

  it("stops active streaming when processing is disabled mid-recording", async () => {
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

    const { rerender } = renderHook(
      ({ processingEnabled }) => useDictationSession({ processingEnabled }),
      { initialProps: { processingEnabled: true } },
    );

    await waitFor(() => expect(getSelectedSpeechProvider).toHaveBeenCalled());
    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(1600), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(startAssemblyAiStreamingSession).toHaveBeenCalledTimes(1);
      expect(sendAssemblyAiStreamingAudio).toHaveBeenCalledTimes(1);
    });

    rerender({ processingEnabled: false });

    await waitFor(() => {
      expect(stopAssemblyAiStreamingSession).toHaveBeenCalledTimes(1);
    });
  });

  it("does not stream with provider settings loaded after processing was disabled", async () => {
    useAvailableMicrophone();
    let resolveStaleProvider: ((provider: "assemblyai") => void) | undefined;
    let resolveFreshProvider: ((provider: "deepgram") => void) | undefined;
    getSelectedSpeechProvider
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveStaleProvider = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFreshProvider = resolve;
        }),
      );
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

    const { rerender } = renderHook(
      ({ processingEnabled }) => useDictationSession({ processingEnabled }),
      { initialProps: { processingEnabled: true } },
    );

    await waitFor(() => expect(getSelectedSpeechProvider).toHaveBeenCalledTimes(1));
    rerender({ processingEnabled: false });
    await act(async () => {
      resolveStaleProvider?.("assemblyai");
      await Promise.resolve();
    });

    rerender({ processingEnabled: true });
    await waitFor(() => expect(getSelectedSpeechProvider).toHaveBeenCalledTimes(2));
    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(1600), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(startAssemblyAiStreamingSession).not.toHaveBeenCalled();
    expect(sendAssemblyAiStreamingAudio).not.toHaveBeenCalled();

    await act(async () => {
      resolveFreshProvider?.("deepgram");
      await Promise.resolve();
      await Promise.resolve();
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(1600), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(startDeepgramStreamingSession).toHaveBeenCalledTimes(1);
    });
    expect(startAssemblyAiStreamingSession).not.toHaveBeenCalled();
  });

  it("does not stream with provider change events delivered after processing was disabled", async () => {
    useAvailableMicrophone();
    getSelectedSpeechProvider
      .mockResolvedValueOnce("openai")
      .mockReturnValueOnce(new Promise(() => {}));
    const eventHandlers = new Map<
      string,
      (event: { payload: unknown }) => void | Promise<void>
    >();
    listenToTauriEvent.mockImplementation(async (event, handler) => {
      eventHandlers.set(event, handler as (event: { payload: unknown }) => void);
      return () => {};
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

    const { rerender } = renderHook(
      ({ processingEnabled }) => useDictationSession({ processingEnabled }),
      { initialProps: { processingEnabled: true } },
    );

    await waitFor(() => expect(getSelectedSpeechProvider).toHaveBeenCalledTimes(1));
    rerender({ processingEnabled: false });

    act(() => {
      eventHandlers.get("vaak://speech-provider-changed")?.({
        payload: "assemblyai",
      });
    });

    rerender({ processingEnabled: true });
    await waitFor(() => expect(getSelectedSpeechProvider).toHaveBeenCalledTimes(2));
    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(1600), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(startAssemblyAiStreamingSession).not.toHaveBeenCalled();
    expect(sendAssemblyAiStreamingAudio).not.toHaveBeenCalled();
  });

  it("ignores detached streaming stop failures after processing is disabled", async () => {
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
    let rejectStreamingStop: ((reason: unknown) => void) | undefined;
    stopAssemblyAiStreamingSession.mockReturnValueOnce(
      new Promise<boolean>((_, reject) => {
        rejectStreamingStop = reject;
      }),
    );

    const { result, rerender } = renderHook(
      ({ processingEnabled }) => useDictationSession({ processingEnabled }),
      { initialProps: { processingEnabled: true } },
    );

    await waitFor(() => expect(getSelectedSpeechProvider).toHaveBeenCalled());
    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(1600), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(startAssemblyAiStreamingSession).toHaveBeenCalledTimes(1);
      expect(sendAssemblyAiStreamingAudio).toHaveBeenCalledTimes(1);
    });

    rerender({ processingEnabled: false });
    await waitFor(() =>
      expect(stopAssemblyAiStreamingSession).toHaveBeenCalledTimes(1),
    );
    await act(async () => {
      rejectStreamingStop?.(new Error("detached streaming stop failed"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.streamingError).toBeNull();
  });

  it("stops active recording and streaming when the session is disabled", async () => {
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

    const { result, rerender } = renderHook(
      ({ enabled }) => useDictationSession({ enabled }),
      { initialProps: { enabled: true } },
    );

    act(() => {
      result.current.startManualDictation();
    });
    await waitFor(() => expect(getSelectedSpeechProvider).toHaveBeenCalled());
    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(1600), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(startAssemblyAiStreamingSession).toHaveBeenCalledTimes(1);
      expect(sendAssemblyAiStreamingAudio).toHaveBeenCalledTimes(1);
    });

    rerender({ enabled: false });

    await waitFor(() => {
      expect(stopRecording).toHaveBeenCalledTimes(1);
      expect(stopAssemblyAiStreamingSession).toHaveBeenCalledTimes(1);
    });
    expect(result.current.activeMode).toBe("idle");
  });

  it("does not start streaming for command-mode recordings", async () => {
    setWindowsPlatform();
    useAvailableMicrophone();
    isTauriRuntime.mockReturnValue(true);
    getSelectedSpeechProvider.mockResolvedValue("assemblyai");
    let handler:
      | ((event: { payload: SessionHotkeyEvent }) => void | Promise<void>)
      | null = null;
    let recorderOptions: Parameters<typeof useAudioRecorder>[0] | undefined;
    listenToTauriEvent.mockImplementation(async (_event, nextHandler) => {
      handler = nextHandler;
      return () => {};
    });
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
      await Promise.resolve();
    });
    act(() => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(1600), 16000);
    });

    expect(startAssemblyAiStreamingSession).not.toHaveBeenCalled();
    expect(sendAssemblyAiStreamingAudio).not.toHaveBeenCalled();
  });

  it("cleans up stale backend streaming sessions before command-mode recording", async () => {
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

    renderHook(() => useDictationSession());

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

    expect(cleanupAssemblyAiStreamingSessions).toHaveBeenCalledTimes(1);
    expect(cleanupDeepgramStreamingSessions).toHaveBeenCalledTimes(1);
    expect(cleanupElevenLabsStreamingSessions).toHaveBeenCalledTimes(1);
    expect(cleanupSmallestStreamingSessions).toHaveBeenCalledTimes(1);
    expect(startRecording).toHaveBeenCalledTimes(1);
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
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(1600), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.streamingError).toBe(
        "invalid_provider_request: no active AssemblyAI streaming session",
      );
    });

    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(1600), 16000);
      await Promise.resolve();
    });

    expect(startAssemblyAiStreamingSession).toHaveBeenCalledTimes(1);
  });

  it("ignores stale streaming audio write failures after processing is disabled", async () => {
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
    let rejectStreamingSend: ((reason: unknown) => void) | undefined;
    sendAssemblyAiStreamingAudio.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectStreamingSend = reject;
      }),
    );

    const { result, rerender } = renderHook(
      ({ processingEnabled }) => useDictationSession({ processingEnabled }),
      { initialProps: { processingEnabled: true } },
    );

    await waitFor(() => expect(getSelectedSpeechProvider).toHaveBeenCalled());
    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(1600), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(sendAssemblyAiStreamingAudio).toHaveBeenCalledTimes(1),
    );

    rerender({ processingEnabled: false });
    await act(async () => {
      rejectStreamingSend?.(new Error("stale streaming send failed"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.streamingError).toBeNull();
  });

  it("treats reported AssemblyAI dropped frames as a streaming failure", async () => {
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
    sendAssemblyAiStreamingAudio.mockResolvedValueOnce({
      bytesSent: 1600,
      droppedFrames: 1,
      frameCount: 1,
    });

    const { result } = renderHook(() => useDictationSession());

    await waitFor(() => expect(getSelectedSpeechProvider).toHaveBeenCalled());
    await act(async () => {
      recorderOptions?.onPcm16Chunk?.(new Uint8Array(1600), 16000);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.streamingError).toBe(
        "AssemblyAI streaming dropped 1 audio frame(s).",
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

  it("does not report a stale verification recording error after being disabled mid-start", async () => {
    setWindowsPlatform();
    useAvailableMicrophone();
    isTauriRuntime.mockReturnValue(true);
    const registered: {
      handler:
        | ((event: { payload: SessionHotkeyEvent }) => void | Promise<void>)
        | null;
    } = { handler: null };
    let rejectStart: ((reason: unknown) => void) | undefined;
    startRecording.mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => {
        rejectStart = reject;
      }),
    );
    listenToTauriEvent.mockImplementation(async (_event, nextHandler) => {
      registered.handler = nextHandler;
      return () => {};
    });

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useDictationSession({ enabled, processingEnabled: false }),
      { initialProps: { enabled: true } },
    );

    await vi.waitFor(() => expect(listenToTauriEvent).toHaveBeenCalled());
    if (!registered.handler) {
      throw new Error("Hotkey handler was not registered.");
    }
    const hotkeyStart = registered.handler({
      payload: {
        error: "No writable text field found for dictation.",
        field: null,
        mode: "dictation",
        phase: "start",
        shortcut: "Ctrl+Win",
      },
    });
    await waitFor(() => expect(startRecording).toHaveBeenCalledTimes(1));

    rerender({ enabled: false });
    await act(async () => {
      rejectStart?.(new Error("Microphone denied"));
      await hotkeyStart;
    });

    expect(result.current.activeMode).toBe("idle");
    expect(result.current.focusedFieldError).toBeNull();
  });
});
