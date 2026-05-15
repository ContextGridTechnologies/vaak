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

const HOTKEY_STOP_TAIL_MS = 250;

export function useDictationSession({
  enabled = true,
  processingEnabled = true,
}: {
  enabled?: boolean;
  processingEnabled?: boolean;
} = {}) {
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
  const hotkeyStopTimerRef = useRef<ReturnType<
    typeof globalThis.setTimeout
  > | null>(null);
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

  const clearPendingHotkeyStop = useCallback(() => {
    if (hotkeyStopTimerRef.current !== null) {
      globalThis.clearTimeout(hotkeyStopTimerRef.current);
      hotkeyStopTimerRef.current = null;
    }
  }, []);

  const startWithFocusCapture = useCallback(
    async (
      knownField?: FocusedFieldInfo | null,
      trigger: Exclude<DictationTrigger, null> = "manual",
    ) => {
      if (!enabled) {
        return;
      }

      clearPendingHotkeyStop();
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

      if (!processingEnabled) {
        setFocusedField(knownField ?? null);
        try {
          await start();
        } catch (err) {
          setFocusedFieldError(`Recording failed: ${normalizeError(err)}`);
        }
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
    [
      clearPendingHotkeyStop,
      enabled,
      isManualUnavailable,
      manualUnavailableMessage,
      processingEnabled,
      start,
    ],
  );

  const stopHotkeyRecording = useCallback(
    (mode: ActiveMode) => {
      if (!enabled) {
        return;
      }

      setCompletedMode(mode);
      setActiveMode("idle");
      clearPendingHotkeyStop();
      hotkeyStopTimerRef.current = globalThis.setTimeout(() => {
        setRecordingEndedAt(new Date().toISOString());
        stop();
        hotkeyStopTimerRef.current = null;
      }, HOTKEY_STOP_TAIL_MS);
    },
    [clearPendingHotkeyStop, enabled, stop],
  );

  const startManualDictation = useCallback(async () => {
    if (!enabled) {
      return;
    }

    setActiveMode("dictation");
    await startWithFocusCapture(undefined, "manual");
  }, [enabled, startWithFocusCapture]);

  const stopManualRecording = useCallback(() => {
    if (!enabled) {
      return;
    }

    clearPendingHotkeyStop();
    setCompletedMode("dictation");
    setActiveMode("idle");
    setRecordingEndedAt(new Date().toISOString());
    stop();
  }, [clearPendingHotkeyStop, enabled, stop]);

  const selectDevice = useCallback((value: string) => {
    if (value === "default" || value === "system") {
      void selectSystem();
      return;
    }
    void selectManual(value);
  }, [selectManual, selectSystem]);

  useEffect(() => {
    if (!enabled || !isWindows || !tauriAvailable) {
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
  }, [enabled, isWindows, tauriAvailable]);

  useEffect(() => {
    if (!enabled || !hasPermission || isManualUnavailable) {
      return;
    }

    void prepare();
  }, [enabled, hasPermission, isManualUnavailable, prepare]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (lastDeviceIdRef.current === selectedDeviceId) {
      return;
    }
    lastDeviceIdRef.current = selectedDeviceId;
    if (isRecording) {
      clearPendingHotkeyStop();
      setRestartOnStop(true);
      stop();
    }
  }, [clearPendingHotkeyStop, enabled, selectedDeviceId, isRecording, stop]);

  useEffect(() => {
    if (enabled && restartOnStop && status === "stopped") {
      setRestartOnStop(false);
      if (!isManualUnavailable) {
        void start();
      }
    }
  }, [enabled, isManualUnavailable, restartOnStop, start, status]);

  useEffect(() => {
    if (!enabled || !isWindows || !tauriAvailable) {
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
                } else if (!processingEnabled) {
                  await startWithFocusCapture(null, "hotkey");
                } else {
                  setFocusedField(null);
                  setFocusedFieldError(
                  payload.error || "No writable text field found for dictation.",
                );
              }
              return;
            }

            if (payload.phase === "stop") {
              stopHotkeyRecording("dictation");
              return;
            }
          }

          if (payload.mode === "command") {
            if (payload.phase === "start") {
              clearPendingHotkeyStop();
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
    clearPendingHotkeyStop,
    enabled,
    processingEnabled,
    stopHotkeyRecording,
    tauriAvailable,
  ]);

  useEffect(() => {
    return () => {
      clearPendingHotkeyStop();
    };
  }, [clearPendingHotkeyStop]);

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
    processingEnabled,
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
