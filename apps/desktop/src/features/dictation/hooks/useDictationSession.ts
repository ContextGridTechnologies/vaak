import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAudioDevices } from "@/hooks/useAudioDevices";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { normalizeError } from "@/lib/errors";
import {
  getFocusedField,
  getHotkeyBindings,
  type FocusedFieldInfo,
  type HotkeyBindings,
  isTauriRuntime,
  listenToTauriEvent,
  type SessionHotkeyEvent,
} from "@/lib/tauri";

type ActiveMode = "idle" | "dictation" | "command";

export function useDictationSession() {
  const tauriAvailable = isTauriRuntime();
  const {
    devices,
    isLoading,
    hasPermission,
    error: deviceError,
    refresh,
    requestPermission,
  } = useAudioDevices();
  const [selectedDeviceId, setSelectedDeviceId] = useState("default");
  const [restartOnStop, setRestartOnStop] = useState(false);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
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
  const lastDeviceIdRef = useRef<string>("default");
  const { status, error, audioUrl, elapsedMs, start, stop, reset } =
    useAudioRecorder({
      deviceId: selectedDeviceId,
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
    selectedDeviceId === "default"
      ? "System default"
      : selectedDevice?.label || "Unknown microphone";
  const isWindows = useMemo(() => {
    const uaPlatform = (
      navigator as Navigator & { userAgentData?: { platform?: string } }
    ).userAgentData?.platform;
    const platform = (uaPlatform || navigator.platform || "").toLowerCase();
    return platform.includes("win");
  }, []);

  const startWithFocusCapture = useCallback(
    async (knownField?: FocusedFieldInfo | null) => {
      setFocusedFieldError(null);

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
        getFocusedField(),
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
    [start],
  );

  const stopHotkeyRecording = useCallback(() => {
    setActiveMode("idle");
    stop();
  }, [stop]);

  const startManualDictation = useCallback(async () => {
    setActiveMode("dictation");
    await startWithFocusCapture();
  }, [startWithFocusCapture]);

  const stopManualRecording = useCallback(() => {
    setActiveMode("idle");
    stop();
  }, [stop]);

  const selectDevice = useCallback((value: string) => {
    setSelectedDeviceId(value);
    setFallbackNotice(null);
  }, []);

  useEffect(() => {
    const stored = globalThis.localStorage?.getItem("bluevoice.mic.deviceId");
    if (stored) {
      setSelectedDeviceId(stored);
    }
  }, []);

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
    globalThis.localStorage?.setItem(
      "bluevoice.mic.deviceId",
      selectedDeviceId,
    );
  }, [selectedDeviceId]);

  useEffect(() => {
    if (
      selectedDeviceId !== "default" &&
      deviceOptions.length > 0 &&
      !deviceOptions.some((device) => device.deviceId === selectedDeviceId)
    ) {
      setFallbackNotice(
        "Previously selected microphone is unavailable. Switched to system default.",
      );
      setSelectedDeviceId("default");
    }
  }, [deviceOptions, selectedDeviceId]);

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
      start();
    }
  }, [restartOnStop, start, status]);

  useEffect(() => {
    if (!isWindows || !tauriAvailable) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;
    const register = async () => {
      const detach = await listenToTauriEvent<SessionHotkeyEvent>(
        "bluevoice://session-hotkey",
        async (event) => {
          const payload = event.payload;

          if (payload.mode === "dictation") {
            if (payload.phase === "start") {
              setActiveMode("dictation");
              if (payload.field) {
                await startWithFocusCapture(payload.field);
              } else {
                setFocusedField(null);
                setFocusedFieldError(
                  payload.error || "No writable text field found for dictation.",
                );
              }
              return;
            }

            if (payload.phase === "stop") {
              stopHotkeyRecording();
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
              stopHotkeyRecording();
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
    audioUrl,
    deviceError,
    deviceOptions,
    durationLabel,
    fallbackNotice,
    focusedField,
    focusedFieldError,
    hasPermission,
    hotkeyBindings,
    isLoading,
    isRecording,
    isWindows,
    recorderError: error,
    refresh,
    requestPermission,
    reset,
    selectedDeviceId,
    selectedLabel,
    selectDevice,
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
