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
  cleanupDeepgramStreamingSessions,
  cleanupElevenLabsStreamingSessions,
  cleanupSmallestStreamingSessions,
  getHotkeyBindings,
  getSelectedSpeechProvider,
  getSystemSettings,
  type DictationMode,
  type FocusedFieldInfo,
  type HotkeyBindings,
  isTauriRuntime,
  listenToTauriEvent,
  sendAssemblyAiStreamingAudio,
  sendDeepgramStreamingAudio,
  sendElevenLabsStreamingAudio,
  sendSmallestStreamingAudio,
  type SessionHotkeyEvent,
  SPEECH_PROVIDER_CHANGED_EVENT,
  SYSTEM_SETTINGS_CHANGED_EVENT,
  startAssemblyAiStreamingSession,
  startDeepgramStreamingSession,
  startElevenLabsStreamingSession,
  startSmallestStreamingSession,
  stopAssemblyAiStreamingSession,
  stopDeepgramStreamingSession,
  stopElevenLabsStreamingSession,
  stopSmallestStreamingSession,
  type ProviderTimelineEvent,
  type SpeechProviderId,
  type StreamingProviderEvent,
  type StreamingProviderId,
} from "@/lib/tauri";

type ActiveMode = "idle" | "dictation" | "command";
type DictationTrigger = "hotkey" | "manual" | null;

const HOTKEY_STOP_TAIL_MS = 250;
const DEFAULT_DICTATION_MODE: DictationMode = "auto";
const STREAMING_PROVIDER_PROFILES = {
  assemblyai: {
    frameBytes: 1_600,
    label: "AssemblyAI",
    start: startAssemblyAiStreamingSession,
    send: sendAssemblyAiStreamingAudio,
    stop: stopAssemblyAiStreamingSession,
    cleanup: cleanupAssemblyAiStreamingSessions,
  },
  deepgram: {
    frameBytes: 3_200,
    label: "Deepgram",
    start: startDeepgramStreamingSession,
    send: sendDeepgramStreamingAudio,
    stop: stopDeepgramStreamingSession,
    cleanup: cleanupDeepgramStreamingSessions,
  },
  elevenlabs: {
    frameBytes: 3_200,
    label: "ElevenLabs",
    start: startElevenLabsStreamingSession,
    send: sendElevenLabsStreamingAudio,
    stop: stopElevenLabsStreamingSession,
    cleanup: cleanupElevenLabsStreamingSessions,
  },
  smallest: {
    frameBytes: 4_096,
    label: "Smallest AI",
    start: startSmallestStreamingSession,
    send: sendSmallestStreamingAudio,
    stop: stopSmallestStreamingSession,
    cleanup: cleanupSmallestStreamingSessions,
  },
} satisfies Record<
  StreamingProviderId,
  {
    frameBytes: number;
    label: string;
    start: (input: {
      onEvent: (event: StreamingProviderEvent) => void;
    }) => Promise<{ providerEvents?: ProviderTimelineEvent[] }>;
    send: (audioBytes: Uint8Array) => Promise<{ droppedFrames: number }>;
    stop: () => Promise<boolean>;
    cleanup: () => Promise<boolean>;
  }
>;

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
  const streamingProviderRef = useRef<StreamingProviderId | null>(null);

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
    streamingProviderRef.current = null;
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
    streamingProviderRef.current = null;
    setStreamingError(normalizeError(err));
  }, []);

  const ensureStreamingStarted = useCallback(async (provider: StreamingProviderId) => {
    if (streamingStartedRef.current) {
      return;
    }
    if (streamingStartPromiseRef.current) {
      await streamingStartPromiseRef.current;
      return;
    }

    const profile = STREAMING_PROVIDER_PROFILES[provider];
    const startPromise = profile.start({
      onEvent: (event) => {
        appendStreamingEvents(event.providerEvents);
        if (event.eventType === "final" && event.text?.trim()) {
          const turnOrder = streamingFinalTurnOrder(
            event,
            streamingFinalTurnsRef.current.size,
          );
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
          streamingProviderRef.current = null;
        }
        if (event.eventType === "error") {
          failStreaming(`${profile.label} streaming failed`);
        }
      },
    })
      .then((result) => {
        appendStreamingEvents(result.providerEvents);
        streamingStartedRef.current = true;
        streamingProviderRef.current = provider;
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

  const sendStreamingFrame = useCallback(async (
    provider: StreamingProviderId,
    chunk: Uint8Array,
  ) => {
    const profile = STREAMING_PROVIDER_PROFILES[provider];
    const result = await profile.send(chunk);
    if (result.droppedFrames > 0) {
      throw new Error(
        `${profile.label} streaming dropped ${result.droppedFrames} audio frame(s).`,
      );
    }
  }, []);

  const handlePcm16Chunk = useCallback(
    (chunk: Uint8Array) => {
      const provider = streamingProviderForSettings(
        selectedSpeechProvider,
        dictationMode,
        processingEnabled,
      );
      if (!provider || streamingFailedRef.current) {
        return;
      }

      const profile = STREAMING_PROVIDER_PROFILES[provider];
      streamingQueueRef.current.push(
        ...appendStreamingFrames(chunk, streamingPendingPcmRef, profile.frameBytes),
      );
      void ensureStreamingStarted(provider)
        .then(async () => {
          if (!streamingStartedRef.current) {
            return;
          }
          const queued = streamingQueueRef.current.splice(0);
          for (const queuedChunk of queued) {
            await sendStreamingFrame(provider, queuedChunk);
          }
        })
        .catch((err) => {
          failStreaming(err);
        });
    },
    [
      ensureStreamingStarted,
      failStreaming,
      dictationMode,
      processingEnabled,
      sendStreamingFrame,
      selectedSpeechProvider,
    ],
  );

  const flushStreamingAudio = useCallback(async (provider: StreamingProviderId) => {
    if (streamingFailedRef.current) {
      return;
    }

    const profile = STREAMING_PROVIDER_PROFILES[provider];
    const pending = streamingPendingPcmRef.current;
    if (pending.length > 0) {
      const padded = new Uint8Array(profile.frameBytes);
      padded.set(pending);
      streamingPendingPcmRef.current = new Uint8Array(0);
      streamingQueueRef.current.push(padded);
    }

    await ensureStreamingStarted(provider);
    if (!streamingStartedRef.current) {
      return;
    }

    const queued = streamingQueueRef.current.splice(0);
    for (const queuedChunk of queued) {
      await sendStreamingFrame(provider, queuedChunk);
    }
  }, [
    ensureStreamingStarted,
    sendStreamingFrame,
  ]);

  const stopStreaming = useCallback(async () => {
    const provider =
      streamingProviderRef.current ??
      streamingProviderForSettings(
        selectedSpeechProvider,
        dictationMode,
        processingEnabled,
      );
    if (!provider) {
      return;
    }

    try {
      await flushStreamingAudio(provider);
      await STREAMING_PROVIDER_PROFILES[provider].stop();
      streamingProviderRef.current = null;
    } catch (err) {
      setStreamingError(normalizeError(err));
    }
  }, [dictationMode, flushStreamingAudio, processingEnabled, selectedSpeechProvider]);

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
        void stopStreaming();
        hotkeyStopTimerRef.current = null;
      }, HOTKEY_STOP_TAIL_MS);
    },
    [clearPendingHotkeyStop, enabled, stop, stopStreaming],
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
    void stopStreaming();
  }, [clearPendingHotkeyStop, enabled, stop, stopStreaming]);

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
      void Promise.all(
        Object.values(STREAMING_PROVIDER_PROFILES).map((profile) =>
          profile.cleanup().catch(() => false),
        ),
      ).catch(() => {});
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

function streamingProviderForSettings(
  providerId: SpeechProviderId | null,
  dictationMode: DictationMode | null,
  processingEnabled: boolean,
): StreamingProviderId | null {
  if (!processingEnabled || dictationMode === null || dictationMode === "standard") {
    return null;
  }
  return providerId === "assemblyai" ||
    providerId === "deepgram" ||
    providerId === "elevenlabs" ||
    providerId === "smallest"
    ? providerId
    : null;
}

function streamingFinalTurnOrder(
  event: StreamingProviderEvent,
  fallback: number,
) {
  if (typeof event.turnOrder === "number") {
    return event.turnOrder;
  }
  if (typeof event.sequence === "number") {
    return event.sequence;
  }
  return fallback;
}

function appendStreamingFrames(
  chunk: Uint8Array,
  pendingRef: MutableRefObject<Uint8Array>,
  frameBytes: number,
) {
  if (chunk.length === 0) {
    return [];
  }

  const combined = new Uint8Array(pendingRef.current.length + chunk.length);
  combined.set(pendingRef.current);
  combined.set(chunk, pendingRef.current.length);

  const frameCount = Math.floor(combined.length / frameBytes);
  const frames: Uint8Array[] = [];
  for (let index = 0; index < frameCount; index += 1) {
    const start = index * frameBytes;
    frames.push(combined.slice(start, start + frameBytes));
  }

  pendingRef.current = combined.slice(frameCount * frameBytes);
  return frames;
}
