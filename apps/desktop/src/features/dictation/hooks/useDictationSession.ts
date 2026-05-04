import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useMicrophoneSelection } from "@/hooks/useMicrophoneSelection";
import { normalizeError } from "@/lib/errors";
import {
  captureDictationTarget,
  getHotkeyBindings,
  type FocusedFieldInfo,
  type HotkeyBindings,
  isTauriRuntime,
  listenToTauriEvent,
  type SessionHotkeyEvent,
} from "@/lib/tauri";

type ActiveMode = "idle" | "dictation" | "command";
type DictationTrigger = "hotkey" | "manual" | null;

export function useDictationSession() {
  const tauriAvailable = isTauriRuntime();
  const {
    activeMicrophone: probedActiveMicrophone,
    devices,
    isLoading,
    hasPermission,
    error: deviceError,
    refresh,
    requestMicrophoneAccess,
    isManualUnavailable,
    manualUnavailableMessage,
    selectManual,
    selectSystem,
    selection,
  } = useMicrophoneSelection();
  const [restartOnStop, setRestartOnStop] = useState(false);
  const [focusedField, setFocusedField] = useState<FocusedFieldInfo | null>(
    null,
  );
  const [focusedFieldError, setFocusedFieldError] = useState<string | null>(
    null,
  );
  const [hotkeyBindings, setHotkeyBindings] = useState<HotkeyBindings>({
    dictation: "Ctrl+Win+R",
    command: "Ctrl+Win+C",
  });
  const [activeMode, setActiveMode] = useState<ActiveMode>("idle");
  const [completedMode, setCompletedMode] = useState<ActiveMode | null>(null);
  const [dictationTrigger, setDictationTrigger] =
    useState<DictationTrigger>(null);
  const [recordingStartedAt, setRecordingStartedAt] = useState<string | null>(
    null,
  );
  const [recordingEndedAt, setRecordingEndedAt] = useState<string | null>(null);
  const selectedDeviceId =
    selection.mode === "manual" ? selection.deviceId : "system";
  const lastDeviceIdRef = useRef<string>("system");
  const {
    status,
    error,
    audioBlob,
    audioUrl,
    audioLevel,
    captureAnalysis,
    elapsedMs,
    activeMicrophone: recordingActiveMicrophone,
    startupMetrics,
    prepare,
    start,
    stop,
    reset,
  } = useAudioRecorder({
    microphoneSelection: selection,
  });

  const isRecording = status === "recording";
  const statusLabel = getStatusLabel(status);
  const durationLabel = elapsedMs > 0 ? formatDuration(elapsedMs) : "0.0s";
  const deviceOptions = useMemo(
    () => devices.filter((device) => device.deviceId !== "default"),
    [devices],
  );
  const selectedDevice = deviceOptions.find(
    (device) => device.deviceId === selectedDeviceId,
  );
  const selectedLabel =
    recordingActiveMicrophone?.label ??
    probedActiveMicrophone?.label ??
    (selection.mode === "system"
      ? "OS default microphone"
      : selectedDevice?.label || "Unavailable microphone");
  const isWindows = useMemo(() => {
    const uaPlatform = (
      navigator as Navigator & { userAgentData?: { platform?: string } }
    ).userAgentData?.platform;
    const platform = (uaPlatform || navigator.platform || "").toLowerCase();
    return platform.includes("win");
  }, []);

  const startWithFocusCapture = useCallback(
    async (
      knownField?: FocusedFieldInfo | null,
      trigger: Exclude<DictationTrigger, null> = "manual",
    ) => {
      setFocusedFieldError(null);
      setCompletedMode(null);
      setDictationTrigger(trigger);
      setRecordingStartedAt(new Date().toISOString());
      setRecordingEndedAt(null);
      if (isManualUnavailable) {
        setActiveMode("idle");
        setFocusedFieldError(
          manualUnavailableMessage ??
            "Selected microphone is unavailable. Choose another device or switch to automatic mode.",
        );
        return;
      }

      if (knownField) {
        setFocusedField(knownField);
        try {
          await start();
        } catch (err) {
          setFocusedFieldError(`Recording failed: ${normalizeError(err)}`);
        }
        return;
      }

      const [fieldResult, recordingResult] = await Promise.allSettled([
        captureDictationTarget(),
        start(),
      ]);

      if (fieldResult.status === "fulfilled") {
        setFocusedField(fieldResult.value);
      } else {
        setFocusedField(null);
        setFocusedFieldError(normalizeError(fieldResult.reason));
      }

      if (recordingResult.status === "rejected") {
        setFocusedFieldError((current) => {
          const recordingError = normalizeError(recordingResult.reason);
          return current
            ? `${current} Recording failed: ${recordingError}`
            : `Recording failed: ${recordingError}`;
        });
      }
    },
    [isManualUnavailable, manualUnavailableMessage, start],
  );

  const stopHotkeyRecording = useCallback((mode: ActiveMode) => {
    setCompletedMode(mode);
    setActiveMode("idle");
    stop();
  }, [stop]);

  const startManualDictation = useCallback(async () => {
    setActiveMode("dictation");
    await startWithFocusCapture(undefined, "manual");
  }, [startWithFocusCapture]);

  const stopManualRecording = useCallback(() => {
    setCompletedMode("dictation");
    setActiveMode("idle");
    setRecordingEndedAt(new Date().toISOString());
    stop();
  }, [stop]);

  const selectDevice = useCallback((value: string) => {
    if (value === "default" || value === "system") {
      void selectSystem();
      return;
    }
    void selectManual(value);
  }, [selectManual, selectSystem]);

  useEffect(() => {
    if (!isWindows || !tauriAvailable) {
      return;
    }

    let cancelled = false;
    const loadBindings = async () => {
      try {
        const bindings = await getHotkeyBindings();
        if (!cancelled) {
          setHotkeyBindings(bindings);
        }
      } catch {
        // Keep defaults when bindings cannot be loaded.
      }
    };

    void loadBindings();

    return () => {
      cancelled = true;
    };
  }, [isWindows, tauriAvailable]);

  useEffect(() => {
    if (!hasPermission || isManualUnavailable) {
      return;
    }

    void prepare();
  }, [hasPermission, isManualUnavailable, prepare]);

  useEffect(() => {
    if (lastDeviceIdRef.current === selectedDeviceId) {
      return;
    }
    lastDeviceIdRef.current = selectedDeviceId;
    if (isRecording) {
      setRestartOnStop(true);
      stop();
    }
  }, [selectedDeviceId, isRecording, stop]);

  useEffect(() => {
    if (restartOnStop && status === "stopped") {
      setRestartOnStop(false);
      if (!isManualUnavailable) {
        void start();
      }
    }
  }, [isManualUnavailable, restartOnStop, start, status]);

  useEffect(() => {
    if (!isWindows || !tauriAvailable) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;
    const register = async () => {
      const detach = await listenToTauriEvent<SessionHotkeyEvent>(
        "vaak://session-hotkey",
        async (event) => {
          const payload = event.payload;

          if (payload.mode === "dictation") {
            if (payload.phase === "start") {
              setActiveMode("dictation");
              if (payload.field) {
                await startWithFocusCapture(payload.field, "hotkey");
              } else {
                setFocusedField(null);
                setFocusedFieldError(
                  payload.error || "No writable text field found for dictation.",
                );
              }
              return;
            }

            if (payload.phase === "stop") {
              setRecordingEndedAt(new Date().toISOString());
              stopHotkeyRecording("dictation");
              return;
            }
          }

          if (payload.mode === "command") {
            if (payload.phase === "start") {
              setActiveMode("command");
              setFocusedFieldError(null);
              setFocusedField(null);
              try {
                await start();
              } catch (err) {
                setFocusedFieldError(`Recording failed: ${normalizeError(err)}`);
              }
              return;
            }

            if (payload.phase === "stop") {
              stopHotkeyRecording("command");
            }
          }
        },
      );

      if (disposed) {
        detach();
        return;
      }
      unlisten = detach;
    };

    void register();

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [
    isWindows,
    start,
    startWithFocusCapture,
    stopHotkeyRecording,
    tauriAvailable,
  ]);

  return {
    activeMode,
    audioBlob,
    audioLevel,
    audioUrl,
    captureAnalysis,
    completedMode,
    deviceError,
    deviceOptions,
    durationLabel,
    fallbackNotice: manualUnavailableMessage,
    focusedField,
    focusedFieldError,
    hasPermission,
    hotkeyBindings,
    isLoading,
    isRecording,
    isWindows,
    dictationTrigger,
    recorderError: error,
    recordingMetrics: startupMetrics,
    recordingEndedAt,
    recordingStartedAt,
    refresh,
    requestPermission: requestMicrophoneAccess,
    reset,
    selectedDeviceId,
    selectedLabel,
    selection,
    selectManual,
    selectDevice,
    selectSystem,
    startManualDictation,
    status,
    statusLabel,
    stopManualRecording,
    tauriAvailable,
  };
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 100) / 10;
  return `${seconds.toFixed(1)}s`;
}

function getStatusLabel(status: "idle" | "recording" | "stopped" | "error") {
  switch (status) {
    case "recording":
      return "Recording";
    case "stopped":
      return "Captured";
    case "error":
      return "Error";
    default:
      return "Idle";
  }
}
