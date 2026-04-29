import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Field,
  Panel,
  StatusPill,
} from "../../components";
import { useAudioDevices } from "../../hooks/useAudioDevices";
import { normalizeError } from "../../lib/errors";
import { useAudioRecorder } from "../../hooks/useAudioRecorder";
import {
  getHotkeyBindings,
  getFocusedField,
  type HotkeyBindings,
  type FocusedFieldInfo,
  isTauriRuntime,
  listenToTauriEvent,
  type SessionHotkeyEvent,
} from "../../lib/tauri";

export function DictationPanel() {
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
  const [focusedField, setFocusedField] = useState<FocusedFieldInfo | null>(null);
  const [focusedFieldError, setFocusedFieldError] = useState<string | null>(null);
  const [hotkeyBindings, setHotkeyBindings] = useState<HotkeyBindings>({
    dictation: "Ctrl+Win+R",
    command: "Ctrl+Win+C",
  });
  const [activeMode, setActiveMode] = useState<"idle" | "dictation" | "command">(
    "idle",
  );
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
    const uaPlatform = (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform;
    const platform = (uaPlatform || navigator.platform || "").toLowerCase();
    return platform.includes("win");
  }, []);

  const startWithFocusCapture = useCallback(async (knownField?: FocusedFieldInfo | null) => {
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
  }, [start]);

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
  }, [isWindows, start, startWithFocusCapture, stopHotkeyRecording, tauriAvailable]);

  return (
    <Panel
      title="Dictation Capture"
      description="Capture microphone audio locally for Phase 2 testing."
      actions={
        <div className="button-row">
          <Button
            onClick={isRecording ? stopManualRecording : startManualDictation}
            disabled={status === "error"}
          >
            {isRecording ? "Stop Recording" : "Start Recording"}
          </Button>
          <Button
            variant="secondary"
            onClick={reset}
            disabled={!audioUrl}
          >
            Clear
          </Button>
        </div>
      }
    >
        {isWindows && (
          <Alert variant="info">
            {tauriAvailable
              ? `Global hotkeys: hold ${hotkeyBindings.dictation} for dictation, hold ${hotkeyBindings.command} for command mode.`
              : "Global hotkeys are available only in the Tauri desktop shell."}
          </Alert>
        )}
        <div className="meta-line">
          Active mode: <strong>{activeMode}</strong>
        </div>
        <div className="device-row">
          <Field
            label="Microphone"
            hint="Switching devices while recording restarts the recorder automatically."
            className="device-row__field"
          >
            <select
              className="input"
              value={selectedDeviceId}
              onChange={(event) => {
                setSelectedDeviceId(event.target.value);
                setFallbackNotice(null);
              }}
              disabled={isLoading}
            >
              <option value="default">System default</option>
              {deviceOptions.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Microphone ${index + 1}`}
                </option>
              ))}
            </select>
          </Field>
          <div className="device-actions">
            <Button
              variant="secondary"
              onClick={refresh}
              disabled={isLoading}
            >
              Refresh
            </Button>
            {!hasPermission && (
              <Button onClick={requestPermission}>Enable Microphone</Button>
            )}
          </div>
        </div>
        <div className="meta-line">
          Selected: <strong>{selectedLabel}</strong>
          {!hasPermission && " (labels hidden until permission is granted)"}
        </div>
        <div className="status-line">
          <StatusPill tone={status}>{statusLabel}</StatusPill>
          <span className="status-text">
            {isRecording ? "Recording..." : "Last capture"} {durationLabel}
          </span>
        </div>
        {focusedField && (
          <Alert variant="success">
            Target field: <strong>{focusedField.controlName || "Unnamed"}</strong>
            {" in "}
            <strong>{focusedField.windowTitle || "Unknown window"}</strong>
          </Alert>
        )}
        {audioUrl && (
          <audio className="audio-player" controls src={audioUrl}>
            <track
              kind="captions"
              src="data:text/vtt,WEBVTT"
              srcLang="en"
              label="captions"
              default
            />
            Your browser does not support the audio element.
          </audio>
        )}
        {fallbackNotice && <Alert variant="warning">{fallbackNotice}</Alert>}
        {focusedFieldError && <Alert variant="error">{focusedFieldError}</Alert>}
        {deviceError && <Alert variant="error">{deviceError}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
    </Panel>
  );
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
