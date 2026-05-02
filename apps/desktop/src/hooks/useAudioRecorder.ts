import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  activeMicrophoneFromStream,
  microphoneConstraints,
  type ActiveMicrophone,
  type MicrophoneSelection,
} from "./useMicrophoneSelection";

export type RecorderStatus = "idle" | "recording" | "stopped" | "error";

export type RecorderStartupMetrics = {
  startupMs: number;
  streamAcquisitionMs: number;
  reusedWarmStream: boolean;
};

type RecorderState = {
  status: RecorderStatus;
  error: string | null;
  audioBlob: Blob | null;
  audioUrl: string | null;
  elapsedMs: number;
  activeMicrophone: ActiveMicrophone | null;
  startupMetrics: RecorderStartupMetrics | null;
};

type RecorderActions = {
  prepare: () => Promise<void>;
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
  const [startupMetrics, setStartupMetrics] =
    useState<RecorderStartupMetrics | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const preparePromiseRef = useRef<Promise<MediaStream> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(
    null,
  );
  const selectionKey = useMemo(() => JSON.stringify(microphoneSelection), [
    microphoneSelection,
  ]);

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

  const stopTracks = (stream: MediaStream | null) => {
    if (!stream) {
      return;
    }
    stream.getTracks().forEach((track) => track.stop());
  };

  const ensureStream = useCallback(
    async ({ reportErrors }: { reportErrors: boolean }) => {
      if (streamRef.current) {
        return {
          stream: streamRef.current,
          acquisitionMs: 0,
          reusedWarmStream: true,
        };
      }

      if (preparePromiseRef.current) {
        const startedAt = now();
        const stream = await preparePromiseRef.current;
        return {
          stream,
          acquisitionMs: now() - startedAt,
          reusedWarmStream: true,
        };
      }

      const startedAt = now();
      const streamPromise = navigator.mediaDevices.getUserMedia(
        microphoneConstraints(microphoneSelection),
      );
      preparePromiseRef.current = streamPromise;

      try {
        const stream = await streamPromise;
        streamRef.current = stream;
        setActiveMicrophone(activeMicrophoneFromStream(stream));
        console.info("[vaak][recorder] stream_ready", {
          acquisitionMs: Math.round(now() - startedAt),
          selection: microphoneSelection,
          warm: false,
        });
        return {
          stream,
          acquisitionMs: now() - startedAt,
          reusedWarmStream: false,
        };
      } catch (err) {
        if (reportErrors) {
          setStatus("error");
          setError(
            err instanceof Error ? err.message : "Microphone access failed.",
          );
        }
        setActiveMicrophone(null);
        throw err;
      } finally {
        preparePromiseRef.current = null;
      }
    },
    [microphoneSelection],
  );

  const prepare = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      return;
    }

    try {
      await ensureStream({ reportErrors: false });
    } catch (err) {
      console.warn("[vaak][recorder] stream_prepare_failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [ensureStream]);

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
      const startedAt = now();
      const { stream, acquisitionMs, reusedWarmStream } = await ensureStream({
        reportErrors: true,
      });
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
        stopTracks(streamRef.current);
        streamRef.current = null;
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
        recorderRef.current = null;
      };

      recorder.start();
      const nextStartupMetrics = {
        startupMs: Math.round(now() - startedAt),
        streamAcquisitionMs: Math.round(acquisitionMs),
        reusedWarmStream,
      } satisfies RecorderStartupMetrics;
      setStartupMetrics(nextStartupMetrics);
      console.info("[vaak][recorder] recording_started", {
        ...nextStartupMetrics,
      });
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
  }, [ensureStream, releaseAudioUrl]);

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
    setStartupMetrics(null);
    stopTracks(streamRef.current);
    streamRef.current = null;
    preparePromiseRef.current = null;
  }, [releaseAudioUrl]);

  useEffect(() => {
    stopTracks(streamRef.current);
    streamRef.current = null;
    preparePromiseRef.current = null;
    setActiveMicrophone(null);
    setStartupMetrics(null);
  }, [selectionKey]);

  useEffect(() => {
    return () => {
      clearTimer();
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") {
        recorder.stop();
      }
      stopTracks(streamRef.current);
      streamRef.current = null;
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
    startupMetrics,
    prepare,
    start,
    stop,
    reset,
  };
}

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
