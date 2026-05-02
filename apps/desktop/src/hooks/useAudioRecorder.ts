import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  activeMicrophoneFromStream,
  microphoneConstraints,
  type ActiveMicrophone,
  type MicrophoneSelection,
} from "./useMicrophoneSelection";

export type RecorderStatus = "idle" | "recording" | "stopped" | "error";

type RecorderState = {
  status: RecorderStatus;
  error: string | null;
  audioBlob: Blob | null;
  audioUrl: string | null;
  elapsedMs: number;
  activeMicrophone: ActiveMicrophone | null;
};

type RecorderActions = {
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
};

type RecorderOptions = {
  microphoneSelection?: MicrophoneSelection;
  deviceId?: string;
};

export function useAudioRecorder(
  options: RecorderOptions = {},
): RecorderState & RecorderActions {
  const microphoneSelection = useMemo<MicrophoneSelection>(
    () =>
      options.microphoneSelection ??
      (options.deviceId && options.deviceId !== "default"
        ? { mode: "manual", deviceId: options.deviceId }
        : { mode: "system" }),
    [options.deviceId, options.microphoneSelection],
  );
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [activeMicrophone, setActiveMicrophone] =
    useState<ActiveMicrophone | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(
    null,
  );

  const clearTimer = () => {
    if (timerRef.current !== null) {
      globalThis.clearInterval(timerRef.current);
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
      const stream = await navigator.mediaDevices.getUserMedia(
        microphoneConstraints(microphoneSelection),
      );
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      setActiveMicrophone(activeMicrophoneFromStream(stream));
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
        setActiveMicrophone(null);
      };

      recorder.onstop = () => {
        clearTimer();
        const durationMs = startTimeRef.current
          ? Date.now() - startTimeRef.current
          : 0;
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        setAudioBlob(blob);
        releaseAudioUrl(URL.createObjectURL(blob));
        setElapsedMs(durationMs);
        setStatus("stopped");
        stopTracks(recorder);
        recorderRef.current = null;
      };

      recorder.start();
      timerRef.current = globalThis.setInterval(() => {
        if (startTimeRef.current !== null) {
          setElapsedMs(Date.now() - startTimeRef.current);
        }
      }, 250);
      setStatus("recording");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Microphone access failed.");
      setActiveMicrophone(null);
    }
  }, [microphoneSelection, releaseAudioUrl]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state !== "recording") {
      return;
    }
    recorder.stop();
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    setAudioBlob(null);
    releaseAudioUrl(null);
    setElapsedMs(0);
    setStatus("idle");
    setError(null);
    setActiveMicrophone(null);
  }, [releaseAudioUrl]);

  useEffect(() => {
    return () => {
      clearTimer();
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") {
        recorder.stop();
      }
      stopTracks(recorder);
      setAudioBlob(null);
      releaseAudioUrl(null);
      setActiveMicrophone(null);
    };
  }, [releaseAudioUrl]);

  return {
    status,
    error,
    audioBlob,
    audioUrl,
    elapsedMs,
    activeMicrophone,
    start,
    stop,
    reset,
  };
}
