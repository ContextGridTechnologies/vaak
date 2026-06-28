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
  onPcm16Chunk?: (chunk: Uint8Array, sampleRate: number) => void;
};

const STREAMING_SAMPLE_RATE_HZ = 16_000;

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
  const onPcm16ChunkRef = useRef(options.onPcm16Chunk);
  const recordingAnalysisActiveRef = useRef(false);
  const preparePromiseRef = useRef<Promise<MediaStream> | null>(null);
  const recorderGenerationRef = useRef(0);
  const stoppedStreamsRef = useRef<WeakSet<MediaStream>>(new WeakSet());
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(
    null,
  );
  const trackCleanupRef = useRef<(() => void) | null>(null);
  const selectionKey = useMemo(() => JSON.stringify(microphoneSelection), [
    microphoneSelection,
  ]);

  useEffect(() => {
    onPcm16ChunkRef.current = options.onPcm16Chunk;
  }, [options.onPcm16Chunk]);

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
    if (stoppedStreamsRef.current.has(stream)) {
      return;
    }
    stoppedStreamsRef.current.add(stream);
    stream.getTracks().forEach((track) => track.stop());
  };

  const advanceRecorderGeneration = useCallback(() => {
    recorderGenerationRef.current += 1;
  }, []);

  const clearTrackLifecycleListeners = useCallback(() => {
    trackCleanupRef.current?.();
    trackCleanupRef.current = null;
  }, []);

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

  const invalidateStream = useCallback(
    (reason: string) => {
      advanceRecorderGeneration();
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onerror = null;
        recorder.onstop = null;
        if (recorder.state === "recording") {
          recorder.stop();
        }
        recorderRef.current = null;
        chunksRef.current = [];
        startTimeRef.current = null;
        setAudioBlob(null);
        releaseAudioUrl(null);
        setElapsedMs(0);
      }
      console.warn("[vaak][recorder] stream_invalidated", {
        reason,
        selection: microphoneSelection,
      });
      clearTimer();
      clearTrackLifecycleListeners();
      recordingAnalysisActiveRef.current = false;
      setAudioLevel(0);
      stopTracks(streamRef.current);
      streamRef.current = null;
      teardownCaptureAnalysis();
      setActiveMicrophone(null);
      preparePromiseRef.current = null;
    },
    [
      clearTrackLifecycleListeners,
      microphoneSelection,
      releaseAudioUrl,
      teardownCaptureAnalysis,
      advanceRecorderGeneration,
    ],
  );

  const attachTrackLifecycleListeners = useCallback(
    (stream: MediaStream) => {
      clearTrackLifecycleListeners();
      const tracks = stream.getAudioTracks();
      const cleanups = tracks.map((track) => {
        const handleEnded = () => {
          const wasRecording = recorderRef.current?.state === "recording";
          invalidateStream("track-ended");
          if (wasRecording) {
            setStatus("error");
            setError("Microphone stream ended. Start dictation again.");
          }
        };
        const handleMute = () => {
          console.warn("[vaak][recorder] track_muted", {
            label: track.label,
            selection: microphoneSelection,
          });
        };
        const handleUnmute = () => {
          console.info("[vaak][recorder] track_unmuted", {
            label: track.label,
            selection: microphoneSelection,
          });
        };

        track.addEventListener("ended", handleEnded);
        track.addEventListener("mute", handleMute);
        track.addEventListener("unmute", handleUnmute);

        return () => {
          track.removeEventListener("ended", handleEnded);
          track.removeEventListener("mute", handleMute);
          track.removeEventListener("unmute", handleUnmute);
        };
      });

      trackCleanupRef.current = () => {
        for (const cleanup of cleanups) {
          cleanup();
        }
      };
    },
    [clearTrackLifecycleListeners, invalidateStream, microphoneSelection],
  );

  const ensureCaptureAnalysis = useCallback(async (stream: MediaStream) => {
    if (audioWorkletNodeRef.current) {
      if (audioContextRef.current?.state === "suspended") {
        await audioContextRef.current.resume();
      }
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
      context.onstatechange = () => {
        console.info("[vaak][recorder] audio_context_state_changed", {
          state: context.state,
        });
      };
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
        const streamingChunk = resampleFloat32(
          chunk,
          analysisSampleRateRef.current,
          STREAMING_SAMPLE_RATE_HZ,
        );
        onPcm16ChunkRef.current?.(
          float32ToPcm16(streamingChunk),
          STREAMING_SAMPLE_RATE_HZ,
        );
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
      let generation = recorderGenerationRef.current;
      const abortIfStale = (stream: MediaStream) => {
        if (generation === recorderGenerationRef.current) {
          return;
        }
        if (hasLiveAudioTrack(stream)) {
          stopTracks(stream);
        }
        throw new StaleRecorderStartError();
      };

      if (streamRef.current) {
        if (!hasLiveAudioTrack(streamRef.current)) {
          invalidateStream("stale-warm-stream");
          generation = recorderGenerationRef.current;
        } else {
          await ensureCaptureAnalysis(streamRef.current);
          abortIfStale(streamRef.current);
          return {
            stream: streamRef.current,
            acquisitionMs: 0,
            reusedWarmStream: true,
          };
        }
      }

      if (preparePromiseRef.current) {
        const startedAt = now();
        const stream = await preparePromiseRef.current;
        abortIfStale(stream);
        if (!hasLiveAudioTrack(stream)) {
          stopTracks(stream);
          invalidateStream("stale-in-flight-warm-stream");
          generation = recorderGenerationRef.current;
        } else {
          await ensureCaptureAnalysis(stream);
          abortIfStale(stream);
          return {
            stream,
            acquisitionMs: now() - startedAt,
            reusedWarmStream: true,
          };
        }
      }

      const startedAt = now();
      const streamPromise = navigator.mediaDevices.getUserMedia(
        microphoneConstraints(microphoneSelection),
      );
      preparePromiseRef.current = streamPromise;
      let acquiredStream: MediaStream | null = null;

      try {
        const stream = await streamPromise;
        acquiredStream = stream;
        abortIfStale(stream);
        streamRef.current = stream;
        attachTrackLifecycleListeners(stream);
        await ensureCaptureAnalysis(stream);
        abortIfStale(stream);
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
        if (err instanceof StaleRecorderStartError) {
          throw err;
        }
        if (acquiredStream) {
          clearTrackLifecycleListeners();
          stopTracks(acquiredStream);
          if (streamRef.current === acquiredStream) {
            streamRef.current = null;
          }
          teardownCaptureAnalysis();
        }
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
    [
      attachTrackLifecycleListeners,
      clearTrackLifecycleListeners,
      ensureCaptureAnalysis,
      invalidateStream,
      microphoneSelection,
      teardownCaptureAnalysis,
    ],
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
        if (recorderRef.current !== recorder) {
          return;
        }
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        if (recorderRef.current !== recorder) {
          return;
        }
        setStatus("error");
        setError(event.error?.message ?? "Recording error.");
        clearTimer();
        recorder.ondataavailable = null;
        recorder.onerror = null;
        recorder.onstop = null;
        recorderRef.current = null;
        chunksRef.current = [];
        startTimeRef.current = null;
        setAudioBlob(null);
        releaseAudioUrl(null);
        setElapsedMs(0);
        setCaptureAnalysis(null);
        recordingAnalysisActiveRef.current = false;
        setAudioLevel(0);
        clearTrackLifecycleListeners();
        stopTracks(streamRef.current);
        streamRef.current = null;
        teardownCaptureAnalysis();
        setActiveMicrophone(null);
      };

      recorder.onstop = () => {
        if (recorderRef.current !== recorder) {
          return;
        }
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
      if (err instanceof StaleRecorderStartError) {
        return;
      }
      setStatus("error");
      setError(err instanceof Error ? err.message : "Microphone access failed.");
      setActiveMicrophone(null);
    }
  }, [
    clearTrackLifecycleListeners,
    ensureStream,
    releaseAudioUrl,
    teardownCaptureAnalysis,
  ]);

  const stop = useCallback(() => {
    advanceRecorderGeneration();
    const recorder = recorderRef.current;
    if (recorder?.state !== "recording") {
      return;
    }
    recordingAnalysisActiveRef.current = false;
    clearTimer();
    setAudioLevel(0);
    recorder.stop();
  }, [advanceRecorderGeneration]);

  useEffect(() => {
    if (typeof navigator.mediaDevices?.addEventListener !== "function") {
      return;
    }

    const handleDeviceChange = () => {
      invalidateStream("devicechange");
      if (status === "recording") {
        setStatus("error");
        setError("Microphone devices changed. Start dictation again.");
      }
    };

    navigator.mediaDevices?.addEventListener("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", handleDeviceChange);
    };
  }, [invalidateStream, status]);

  const reset = useCallback(() => {
    advanceRecorderGeneration();
    clearTimer();
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
      if (recorder.state === "recording") {
        recorder.stop();
      }
      recorderRef.current = null;
    }
    chunksRef.current = [];
    startTimeRef.current = null;
    setAudioBlob(null);
    releaseAudioUrl(null);
    setAudioLevel(0);
    setCaptureAnalysis(null);
    setElapsedMs(0);
    setStatus("idle");
    setError(null);
    setActiveMicrophone(null);
    setStartupMetrics(null);
    clearTrackLifecycleListeners();
    stopTracks(streamRef.current);
    streamRef.current = null;
    teardownCaptureAnalysis();
    preparePromiseRef.current = null;
    recordingAnalysisActiveRef.current = false;
  }, [
    advanceRecorderGeneration,
    clearTrackLifecycleListeners,
    releaseAudioUrl,
    teardownCaptureAnalysis,
  ]);

  useEffect(() => {
    advanceRecorderGeneration();
    const recorder = recorderRef.current;
    if (recorder) {
      clearTimer();
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
      recordingAnalysisActiveRef.current = false;
      if (recorder.state === "recording") {
        recorder.stop();
      }
      recorderRef.current = null;
      chunksRef.current = [];
      startTimeRef.current = null;
      setAudioBlob(null);
      releaseAudioUrl(null);
      setAudioLevel(0);
      setCaptureAnalysis(null);
      setElapsedMs(0);
      setStatus("idle");
      setError(null);
    }

    clearTrackLifecycleListeners();
    stopTracks(streamRef.current);
    streamRef.current = null;
    teardownCaptureAnalysis();
    preparePromiseRef.current = null;
    setActiveMicrophone(null);
    setAudioLevel(0);
    setStartupMetrics(null);
  }, [
    clearTrackLifecycleListeners,
    releaseAudioUrl,
    selectionKey,
    teardownCaptureAnalysis,
    advanceRecorderGeneration,
  ]);

  useEffect(() => {
    return () => {
      advanceRecorderGeneration();
      clearTimer();
      const recorder = recorderRef.current;
      if (recorder) {
        recordingAnalysisActiveRef.current = false;
        recorder.ondataavailable = null;
        recorder.onerror = null;
        recorder.onstop = null;
        if (recorder.state === "recording") {
          recorder.stop();
        }
        recorderRef.current = null;
        chunksRef.current = [];
        startTimeRef.current = null;
      }
      clearTrackLifecycleListeners();
      stopTracks(streamRef.current);
      streamRef.current = null;
      teardownCaptureAnalysis();
      setAudioBlob(null);
      releaseAudioUrl(null);
      setActiveMicrophone(null);
      setAudioLevel(0);
    };
  }, [
    advanceRecorderGeneration,
    clearTrackLifecycleListeners,
    releaseAudioUrl,
    teardownCaptureAnalysis,
  ]);

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

function hasLiveAudioTrack(stream: MediaStream) {
  const tracks = stream.getAudioTracks();
  return tracks.length > 0 && tracks.some((track) => track.readyState === "live");
}

class StaleRecorderStartError extends Error {
  constructor() {
    super("Recorder startup was superseded.");
    this.name = "StaleRecorderStartError";
  }
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

function float32ToPcm16(samples: Float32Array) {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    const value = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(index * 2, Math.round(value), true);
  }
  return bytes;
}

function resampleFloat32(
  samples: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number,
) {
  if (
    samples.length === 0 ||
    sourceSampleRate <= 0 ||
    targetSampleRate <= 0 ||
    sourceSampleRate === targetSampleRate
  ) {
    return samples;
  }

  const ratio = sourceSampleRate / targetSampleRate;
  const outputLength = Math.max(1, Math.floor(samples.length / ratio));
  const output = new Float32Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio;
    const leftIndex = Math.floor(sourceIndex);
    const rightIndex = Math.min(leftIndex + 1, samples.length - 1);
    const fraction = sourceIndex - leftIndex;
    const left = samples[leftIndex] ?? 0;
    const right = samples[rightIndex] ?? left;
    output[index] = left + (right - left) * fraction;
  }

  return output;
}

function workletModuleUrl() {
  return new URL("/audioCaptureProcessor.js", globalThis.location.origin).toString();
}
