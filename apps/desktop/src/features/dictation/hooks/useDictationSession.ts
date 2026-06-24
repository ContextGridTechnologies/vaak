import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";

import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useMicrophoneSelection } from "@/hooks/useMicrophoneSelection";
import { normalizeError } from "@/lib/errors";
import {
  captureDictationTarget,
  cleanupAssemblyAiStreamingSessions,
  getHotkeyBindings,
  getSelectedSpeechProvider,
  getSystemSettings,
  type DictationMode,
  type FocusedFieldInfo,
  type HotkeyBindings,
  isTauriRuntime,
  listenToTauriEvent,
  sendAssemblyAiStreamingAudio,
  type SessionHotkeyEvent,
  SPEECH_PROVIDER_CHANGED_EVENT,
  SYSTEM_SETTINGS_CHANGED_EVENT,
  startAssemblyAiStreamingSession,
  stopAssemblyAiStreamingSession,
  type ProviderTimelineEvent,
  type SpeechProviderId,
} from "@/lib/tauri";

type ActiveMode = "idle" | "dictation" | "command";
type DictationTrigger = "hotkey" | "manual" | null;

const HOTKEY_STOP_TAIL_MS = 250;
const DEFAULT_DICTATION_MODE: DictationMode = "auto";
const ASSEMBLYAI_STREAMING_FRAME_BYTES = 1_600;

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
  const [selectedSpeechProvider, setSelectedSpeechProvider] =
    useState<SpeechProviderId | null>(null);
  const [dictationMode, setDictationMode] = useState<DictationMode | null>(null);
  const [streamingError, setStreamingError] = useState<string | null>(null);
  const [streamingProviderEvents, setStreamingProviderEvents] = useState<
    ProviderTimelineEvent[]
  >([]);
  const [streamingTranscript, setStreamingTranscript] = useState<string | null>(
    null,
  );
  const selectedDeviceId =
    selection.mode === "manual" ? selection.deviceId : "system";
  const lastDeviceIdRef = useRef<string>("system");
  const hotkeyStopTimerRef = useRef<ReturnType<
    typeof globalThis.setTimeout
  > | null>(null);
  const streamingStartedRef = useRef(false);
  const streamingStartPromiseRef = useRef<Promise<void> | null>(null);
  const streamingFailedRef = useRef(false);
  const streamingQueueRef = useRef<Uint8Array[]>([]);
  const streamingPendingPcmRef = useRef<Uint8Array>(new Uint8Array(0));
  const streamingFinalTurnsRef = useRef<Map<number, string>>(new Map());

  const appendStreamingEvents = useCallback((events?: ProviderTimelineEvent[]) => {
    if (!events || events.length === 0) {
      return;
    }
    setStreamingProviderEvents((current) => [...current, ...events]);
  }, []);

  const resetStreamingState = useCallback(() => {
    streamingStartedRef.current = false;
    streamingStartPromiseRef.current = null;
    streamingFailedRef.current = false;
    streamingQueueRef.current = [];
    streamingPendingPcmRef.current = new Uint8Array(0);
    streamingFinalTurnsRef.current = new Map();
    setStreamingError(null);
    setStreamingProviderEvents([]);
    setStreamingTranscript(null);
  }, []);

  const failStreaming = useCallback((err: unknown) => {
    streamingStartedRef.current = false;
    streamingStartPromiseRef.current = null;
    streamingFailedRef.current = true;
    streamingQueueRef.current = [];
    streamingPendingPcmRef.current = new Uint8Array(0);
    setStreamingError(normalizeError(err));
  }, []);

  const ensureAssemblyAiStreamingStarted = useCallback(async () => {
    if (streamingStartedRef.current) {
      return;
    }
    if (streamingStartPromiseRef.current) {
      await streamingStartPromiseRef.current;
      return;
    }

    const startPromise = startAssemblyAiStreamingSession({
      onEvent: (event) => {
        appendStreamingEvents(event.providerEvents);
        if (event.eventType === "final" && event.text?.trim()) {
          const turnOrder =
            typeof event.turnOrder === "number"
              ? event.turnOrder
              : streamingFinalTurnsRef.current.size;
          streamingFinalTurnsRef.current.set(turnOrder, event.text.trim());
          setStreamingTranscript(
            Array.from(streamingFinalTurnsRef.current.entries())
              .sort(([left], [right]) => left - right)
              .map(([, text]) => text)
              .join(" ")
              .trim(),
          );
        }
        if (event.eventType === "terminated") {
          streamingStartedRef.current = false;
        }
        if (event.eventType === "error") {
          failStreaming("AssemblyAI streaming failed");
        }
      },
    })
      .then((result) => {
        appendStreamingEvents(result.providerEvents);
        streamingStartedRef.current = true;
      })
      .catch((err) => {
        failStreaming(err);
      })
      .finally(() => {
        streamingStartPromiseRef.current = null;
      });
    streamingStartPromiseRef.current = startPromise;
    await startPromise;
  }, [appendStreamingEvents, failStreaming]);

  const sendAssemblyAiStreamingFrame = useCallback(async (chunk: Uint8Array) => {
    const result = await sendAssemblyAiStreamingAudio(chunk);
    if (result.droppedFrames > 0) {
      throw new Error(
        `AssemblyAI streaming dropped ${result.droppedFrames} audio frame(s).`,
      );
    }
  }, []);

  const handlePcm16Chunk = useCallback(
    (chunk: Uint8Array) => {
      if (
        selectedSpeechProvider !== "assemblyai" ||
        dictationMode === null ||
        dictationMode === "standard" ||
        !processingEnabled ||
        streamingFailedRef.current
      ) {
        return;
      }

      streamingQueueRef.current.push(
        ...appendAssemblyAiStreamingFrames(chunk, streamingPendingPcmRef),
      );
      void ensureAssemblyAiStreamingStarted()
        .then(async () => {
          if (!streamingStartedRef.current) {
            return;
          }
          const queued = streamingQueueRef.current.splice(0);
          for (const queuedChunk of queued) {
            await sendAssemblyAiStreamingFrame(queuedChunk);
          }
        })
        .catch((err) => {
          failStreaming(err);
        });
    },
    [
      ensureAssemblyAiStreamingStarted,
      failStreaming,
      dictationMode,
      processingEnabled,
      sendAssemblyAiStreamingFrame,
      selectedSpeechProvider,
    ],
  );

  const flushAssemblyAiStreamingAudio = useCallback(async () => {
    if (
      selectedSpeechProvider !== "assemblyai" ||
      dictationMode === null ||
      dictationMode === "standard" ||
      !processingEnabled ||
      streamingFailedRef.current
    ) {
      return;
    }

    const pending = streamingPendingPcmRef.current;
    if (pending.length > 0) {
      const padded = new Uint8Array(ASSEMBLYAI_STREAMING_FRAME_BYTES);
      padded.set(pending);
      streamingPendingPcmRef.current = new Uint8Array(0);
      streamingQueueRef.current.push(padded);
    }

    await ensureAssemblyAiStreamingStarted();
    if (!streamingStartedRef.current) {
      return;
    }

    const queued = streamingQueueRef.current.splice(0);
    for (const queuedChunk of queued) {
      await sendAssemblyAiStreamingFrame(queuedChunk);
    }
  }, [
    dictationMode,
    ensureAssemblyAiStreamingStarted,
    processingEnabled,
    sendAssemblyAiStreamingFrame,
    selectedSpeechProvider,
  ]);

  const stopAssemblyAiStreaming = useCallback(async () => {
    try {
      await flushAssemblyAiStreamingAudio();
      await stopAssemblyAiStreamingSession();
    } catch (err) {
      setStreamingError(normalizeError(err));
    }
  }, [flushAssemblyAiStreamingAudio]);

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
    onPcm16Chunk: handlePcm16Chunk,
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
      resetStreamingState();
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
      resetStreamingState,
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
        void stopAssemblyAiStreaming();
        hotkeyStopTimerRef.current = null;
      }, HOTKEY_STOP_TAIL_MS);
    },
    [clearPendingHotkeyStop, enabled, stop, stopAssemblyAiStreaming],
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
    void stopAssemblyAiStreaming();
  }, [clearPendingHotkeyStop, enabled, stop, stopAssemblyAiStreaming]);

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
    if (!enabled || !processingEnabled) {
      return;
    }

    let disposed = false;
    let unlistenProvider: (() => void) | undefined;
    let unlistenSettings: (() => void) | undefined;
    const loadSelectedProvider = async () => {
      try {
        const provider = await getSelectedSpeechProvider();
        if (!disposed) {
          setSelectedSpeechProvider(provider);
        }

        try {
          const systemSettings = await getSystemSettings();
          if (!disposed) {
            setDictationMode(systemSettings.dictationMode);
          }
        } catch {
          if (!disposed) {
            setDictationMode(DEFAULT_DICTATION_MODE);
          }
        }
      } catch {
        if (!disposed) {
          setSelectedSpeechProvider(null);
          setDictationMode(DEFAULT_DICTATION_MODE);
        }
      }
    };

    void loadSelectedProvider();
    void listenToTauriEvent<SpeechProviderId>(
      SPEECH_PROVIDER_CHANGED_EVENT,
      (event) => {
        setSelectedSpeechProvider(event.payload);
      },
    ).then((detach) => {
      if (disposed) {
        detach();
        return;
      }
      unlistenProvider = detach;
    });
    void listenToTauriEvent<Awaited<ReturnType<typeof getSystemSettings>>>(
      SYSTEM_SETTINGS_CHANGED_EVENT,
      (event) => {
        setDictationMode(event.payload.dictationMode);
      },
    ).then((detach) => {
      if (disposed) {
        detach();
        return;
      }
      unlistenSettings = detach;
    });

    return () => {
      disposed = true;
      unlistenProvider?.();
      unlistenSettings?.();
    };
  }, [enabled, processingEnabled]);

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
      void cleanupAssemblyAiStreamingSessions().catch(() => {});
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
    streamingError,
    streamingProviderEvents,
    streamingTranscript,
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

function appendAssemblyAiStreamingFrames(
  chunk: Uint8Array,
  pendingRef: MutableRefObject<Uint8Array>,
) {
  if (chunk.length === 0) {
    return [];
  }

  const combined = new Uint8Array(pendingRef.current.length + chunk.length);
  combined.set(pendingRef.current);
  combined.set(chunk, pendingRef.current.length);

  const frameCount = Math.floor(
    combined.length / ASSEMBLYAI_STREAMING_FRAME_BYTES,
  );
  const frames: Uint8Array[] = [];
  for (let index = 0; index < frameCount; index += 1) {
    const start = index * ASSEMBLYAI_STREAMING_FRAME_BYTES;
    frames.push(combined.slice(start, start + ASSEMBLYAI_STREAMING_FRAME_BYTES));
  }

  pendingRef.current = combined.slice(
    frameCount * ASSEMBLYAI_STREAMING_FRAME_BYTES,
  );
  return frames;
}
