import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  analyzeAudioCapture,
  type CaptureAnalysis,
} from "./audioProcessing";
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
  analysisMs?: number;
};

type RecorderState = {
  status: RecorderStatus;
  error: string | null;
  audioBlob: Blob | null;
  audioUrl: string | null;
  audioLevel: number;
  captureAnalysis: CaptureAnalysis | null;
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
  const [audioLevel, setAudioLevel] = useState(0);
  const [captureAnalysis, setCaptureAnalysis] = useState<CaptureAnalysis | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [activeMicrophone, setActiveMicrophone] =
    useState<ActiveMicrophone | null>(null);
  const [startupMetrics, setStartupMetrics] =
    useState<RecorderStartupMetrics | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const analysisSetupPromiseRef = useRef<Promise<void> | null>(null);
  const analysisSampleRateRef = useRef(16000);
  const analysisSamplesRef = useRef<Float32Array[]>([]);
  const recordingAnalysisActiveRef = useRef(false);
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

  const teardownCaptureAnalysis = useCallback(() => {
    audioWorkletNodeRef.current?.disconnect();
    audioSourceRef.current?.disconnect();
    audioWorkletNodeRef.current = null;
    audioSourceRef.current = null;
    analysisSamplesRef.current = [];
    analysisSetupPromiseRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  const ensureCaptureAnalysis = useCallback(async (stream: MediaStream) => {
    if (audioWorkletNodeRef.current) {
      return;
    }
    if (analysisSetupPromiseRef.current) {
      await analysisSetupPromiseRef.current;
      return;
    }
    if (
      typeof AudioContext === "undefined" ||
      typeof AudioWorkletNode === "undefined"
    ) {
      return;
    }

    const setupPromise = (async () => {
      const context = new AudioContext();
      await context.audioWorklet.addModule(workletModuleUrl());
      const source = context.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(context, "vaak-capture-analysis", {
        numberOfOutputs: 0,
      });
      node.port.onmessage = (event) => {
        const payload = event.data as {
          type?: string;
          sampleRate?: number;
          samples?: number[];
        };
        if (payload.type !== "samples" || !payload.samples) {
          return;
        }
        if (typeof payload.sampleRate === "number" && payload.sampleRate > 0) {
          analysisSampleRateRef.current = payload.sampleRate;
        }
        if (!recordingAnalysisActiveRef.current) {
          return;
        }
        const chunk = Float32Array.from(payload.samples);
        analysisSamplesRef.current.push(chunk);
        setAudioLevel((current) => {
          const nextLevel = normalizedLevel(chunk);
          return Math.max(nextLevel, current * 0.82);
        });
      };

      source.connect(node);
      if (context.state === "suspended") {
        await context.resume();
      }

      audioContextRef.current = context;
      audioSourceRef.current = source;
      audioWorkletNodeRef.current = node;
    })();

    analysisSetupPromiseRef.current = setupPromise;
    try {
      await setupPromise;
    } finally {
      analysisSetupPromiseRef.current = null;
    }
  }, []);

  const ensureStream = useCallback(
    async ({ reportErrors }: { reportErrors: boolean }) => {
      if (streamRef.current) {
        await ensureCaptureAnalysis(streamRef.current);
        return {
          stream: streamRef.current,
          acquisitionMs: 0,
          reusedWarmStream: true,
        };
      }

      if (preparePromiseRef.current) {
        const startedAt = now();
        const stream = await preparePromiseRef.current;
        await ensureCaptureAnalysis(stream);
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
        await ensureCaptureAnalysis(stream);
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
    [ensureCaptureAnalysis, microphoneSelection],
  );

  const prepare = useCallback(async () => {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
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
      analysisSamplesRef.current = [];
      recordingAnalysisActiveRef.current = true;
      startTimeRef.current = Date.now();
      setAudioLevel(0);
      setElapsedMs(0);
      setCaptureAnalysis(null);
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
        recordingAnalysisActiveRef.current = false;
        setAudioLevel(0);
        stopTracks(streamRef.current);
        streamRef.current = null;
        teardownCaptureAnalysis();
        setActiveMicrophone(null);
      };

      recorder.onstop = () => {
        clearTimer();
        recordingAnalysisActiveRef.current = false;
        const durationMs = startTimeRef.current
          ? Date.now() - startTimeRef.current
          : 0;
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        setAudioBlob(blob);
        const recordedSamples = combineAnalysisSamples(analysisSamplesRef.current);
        const analysisStartedAt = now();
        const nextCaptureAnalysis =
          recordedSamples.length > 0
            ? analyzeAudioCapture(recordedSamples, analysisSampleRateRef.current)
            : null;
        const analysisMs = Math.max(0, Math.round(now() - analysisStartedAt));
        setCaptureAnalysis(nextCaptureAnalysis);
        setStartupMetrics((current) =>
          current
            ? {
                ...current,
                analysisMs,
              }
            : current,
        );
        releaseAudioUrl(URL.createObjectURL(blob));
        setAudioLevel(0);
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
  }, [ensureStream, releaseAudioUrl, teardownCaptureAnalysis]);

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
    setAudioLevel(0);
    setCaptureAnalysis(null);
    setElapsedMs(0);
    setStatus("idle");
    setError(null);
    setActiveMicrophone(null);
    setStartupMetrics(null);
    stopTracks(streamRef.current);
    streamRef.current = null;
    teardownCaptureAnalysis();
    preparePromiseRef.current = null;
    recordingAnalysisActiveRef.current = false;
  }, [releaseAudioUrl, teardownCaptureAnalysis]);

  useEffect(() => {
    stopTracks(streamRef.current);
    streamRef.current = null;
    teardownCaptureAnalysis();
    preparePromiseRef.current = null;
    setActiveMicrophone(null);
    setAudioLevel(0);
    setStartupMetrics(null);
  }, [selectionKey, teardownCaptureAnalysis]);

  useEffect(() => {
    return () => {
      clearTimer();
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") {
        recordingAnalysisActiveRef.current = false;
        recorder.stop();
      }
      stopTracks(streamRef.current);
      streamRef.current = null;
      teardownCaptureAnalysis();
      setAudioBlob(null);
      releaseAudioUrl(null);
      setActiveMicrophone(null);
      setAudioLevel(0);
    };
  }, [releaseAudioUrl, teardownCaptureAnalysis]);

  return {
    status,
    error,
    audioBlob,
    audioUrl,
    audioLevel,
    captureAnalysis,
    elapsedMs,
    activeMicrophone,
    startupMetrics,
    prepare,
    start,
    stop,
    reset,
  };
}

function combineAnalysisSamples(chunks: Float32Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Float32Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  return combined;
}

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function normalizedLevel(samples: Float32Array) {
  if (samples.length === 0) {
    return 0;
  }

  let sum = 0;
  for (const sample of samples) {
    sum += sample * sample;
  }

  const rms = Math.sqrt(sum / samples.length);
  return Math.max(0, Math.min(1, rms * 4));
}

function workletModuleUrl() {
  return new URL("/audioCaptureProcessor.js", globalThis.location.origin).toString();
}
