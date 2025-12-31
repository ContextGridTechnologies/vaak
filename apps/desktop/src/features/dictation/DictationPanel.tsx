import { useEffect, useMemo, useRef, useState } from "react";
import { useAudioDevices } from "../../hooks/useAudioDevices";
import { useAudioRecorder } from "../../hooks/useAudioRecorder";

export function DictationPanel() {
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

  useEffect(() => {
    const stored = window.localStorage.getItem("bluevoice.mic.deviceId");
    if (stored) {
      setSelectedDeviceId(stored);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("bluevoice.mic.deviceId", selectedDeviceId);
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

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Dictation Capture</h2>
        <div className="button-row">
          <button
            onClick={isRecording ? stop : start}
            disabled={status === "error"}
          >
            {isRecording ? "Stop Recording" : "Start Recording"}
          </button>
          <button
            className="button-secondary"
            onClick={reset}
            disabled={!audioUrl}
          >
            Clear
          </button>
        </div>
      </div>
      <div className="panel-body">
        <p className="hint">
          This captures microphone audio locally for Phase 2 testing.
        </p>
        <div className="device-row">
          <label className="field">
            <span>Microphone</span>
            <select
              className="select"
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
          </label>
          <div className="device-actions">
            <button
              className="button-secondary"
              onClick={refresh}
              disabled={isLoading}
            >
              Refresh
            </button>
            {!hasPermission && (
              <button onClick={requestPermission}>Enable Microphone</button>
            )}
          </div>
        </div>
        <div className="device-info">
          Selected: <strong>{selectedLabel}</strong>
          {!hasPermission && " (labels hidden until permission is granted)"}
        </div>
        <div className="status-line">
          <span className={`status-pill status-${status}`}>{statusLabel}</span>
          <span className="status-text">
            {isRecording ? "Recording..." : "Last capture"} {durationLabel}
          </span>
        </div>
        {audioUrl && (
          <audio className="audio-player" controls src={audioUrl}>
            Your browser does not support the audio element.
          </audio>
        )}
        {fallbackNotice && <div className="warning">{fallbackNotice}</div>}
        {deviceError && <div className="error">{deviceError}</div>}
        {error && <div className="error">{error}</div>}
      </div>
    </section>
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
