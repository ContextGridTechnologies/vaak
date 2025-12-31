import { useCallback, useEffect, useRef, useState } from "react";

type RecorderStatus = "idle" | "recording" | "stopped" | "error";

type RecorderState = {
  status: RecorderStatus;
  error: string | null;
  audioUrl: string | null;
  elapsedMs: number;
};

type RecorderActions = {
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
};

type RecorderOptions = {
  deviceId?: string;
};

export function useAudioRecorder(
  options: RecorderOptions = {},
): RecorderState & RecorderActions {
  const { deviceId } = options;
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const releaseAudioUrl = useCallback((nextUrl: string | null) => {
    setAudioUrl((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return nextUrl;
    });
  }, []);

  const stopTracks = (recorder: MediaRecorder | null) => {
    if (!recorder) {
      return;
    }
    recorder.stream.getTracks().forEach((track) => track.stop());
  };

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setError("Microphone access is not available in this environment.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setStatus("error");
      setError("MediaRecorder is not supported in this environment.");
      return;
    }

    if (recorderRef.current?.state === "recording") {
      return;
    }

    try {
      const constraints =
        deviceId && deviceId !== "default"
          ? { audio: { deviceId: { exact: deviceId } } }
          : { audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      startTimeRef.current = Date.now();
      setElapsedMs(0);
      releaseAudioUrl(null);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        setStatus("error");
        setError(event.error?.message ?? "Recording error.");
        clearTimer();
        stopTracks(recorder);
      };

      recorder.onstop = () => {
        clearTimer();
        const durationMs = startTimeRef.current
          ? Date.now() - startTimeRef.current
          : 0;
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        releaseAudioUrl(URL.createObjectURL(blob));
        setElapsedMs(durationMs);
        setStatus("stopped");
        stopTracks(recorder);
        recorderRef.current = null;
      };

      recorder.start();
      timerRef.current = window.setInterval(() => {
        if (startTimeRef.current !== null) {
          setElapsedMs(Date.now() - startTimeRef.current);
        }
      }, 250);
      setStatus("recording");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Microphone access failed.");
    }
  }, [deviceId, releaseAudioUrl]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") {
      return;
    }
    recorder.stop();
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    releaseAudioUrl(null);
    setElapsedMs(0);
    setStatus("idle");
    setError(null);
  }, [releaseAudioUrl]);

  useEffect(() => {
    return () => {
      clearTimer();
      const recorder = recorderRef.current;
      if (recorder && recorder.state === "recording") {
        recorder.stop();
      }
      stopTracks(recorder);
      releaseAudioUrl(null);
    };
  }, [releaseAudioUrl]);

  return {
    status,
    error,
    audioUrl,
    elapsedMs,
    start,
    stop,
    reset,
  };
}
