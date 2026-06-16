import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { appEnvironment } from "@/config/app-env";
import { normalizeError } from "@/lib/errors";
import {
  getSelectedSpeechProvider,
  getSystemSettings,
  insertIntoActiveTarget,
  listenToTauriEvent,
  persistDictationAudio,
  recordStartupCheckpoint,
  saveDictationRecord,
  type DictationRecordingDiagnostics,
  SPEECH_PROVIDER_CHANGED_EVENT,
  SYSTEM_SETTINGS_CHANGED_EVENT,
  targetSnapshotFromFocusedField,
  transcribeRecording,
  type DictationRecordDraft,
  type DictationProviderRequestTiming,
  type ProviderTimelineEvent,
  type DictationTimeline,
  type DictationMode,
  type SpeechProviderId,
  type TextInsertResult,
} from "@/lib/tauri";
import type { FocusedFieldInfo } from "@/lib/tauri";

export type DictationLifecycleState =
  | "idle"
  | "recording"
  | "transcribing"
  | "inserting"
  | "inserted"
  | "error";

export type DictationLoopErrorKind =
  | "recording"
  | "capture"
  | "focus"
  | "transcription"
  | "insertion";

export type DictationLoopError = {
  kind: DictationLoopErrorKind;
  message: string;
};

type ActiveMode = "idle" | "dictation" | "command";
type CaptureDisposition = "ready" | "unclear";
type CaptureReason = "no_speech" | "too_short" | "low_volume" | "low_snr" | null;

type CaptureAnalysis = {
  disposition: CaptureDisposition;
  reason: CaptureReason;
  metrics: {
    voicedMs: number;
    leadingTrimMs: number;
    trailingTrimMs: number;
    longestPauseMs: number;
    estimatedSnrDb: number;
    averageDbfs: number;
    peakDbfs: number;
  };
  processedAudio: Blob | null;
  transcriptionSegments: Blob[];
};

type SegmentTranscriptionResult =
  | Awaited<ReturnType<typeof transcribeRecording>>
  | null
  | { error: unknown };

export type DictationLoopSession = {
  audioBlob: Blob | null;
  captureAnalysis?: CaptureAnalysis | null;
  dictationTrigger: "hotkey" | "manual" | null;
  completedMode: ActiveMode | null;
  focusedField: FocusedFieldInfo | null;
  focusedFieldError: string | null;
  isRecording: boolean;
  processingEnabled?: boolean;
  recordingMetrics: DictationRecordingDiagnostics | null;
  recordingEndedAt: string | null;
  recordingStartedAt: string | null;
  recorderError: string | null;
  streamingError?: string | null;
  streamingProviderEvents?: ProviderTimelineEvent[];
  streamingTranscript?: string | null;
};

type DictationLoopState = {
  error: DictationLoopError | null;
  insertResult: TextInsertResult | null;
  message: string;
  state: DictationLifecycleState;
  transcript: string | null;
};

const providerLabels: Partial<Record<SpeechProviderId, string>> = {
  openai: "OpenAI",
  "azure-openai": "Azure OpenAI",
  assemblyai: "AssemblyAI",
  deepgram: "Deepgram",
  elevenlabs: "ElevenLabs",
  smallest: "Smallest AI",
};

const idleState: DictationLoopState = {
  error: null,
  insertResult: null,
  message: "Recorder ready.",
  state: "idle",
  transcript: null,
};
const RAW_TRANSCRIPTION_FALLBACK_PEAK_DBFS = -30;
const INSERTION_TIMEOUT_MS = 5_000;
const STREAMING_FINAL_WAIT_MS = 1_500;
const STREAMING_FINAL_POLL_MS = 50;
const DEFAULT_DICTATION_MODE: DictationMode = "auto";

export function useDictationLoop(
  session: DictationLoopSession,
): DictationLoopState {
  const lastProcessedKeyRef = useRef<string | null>(null);
  const latestSessionRef = useRef(session);
  const mountedRef = useRef(true);
  const [providerId, setProviderId] = useState<SpeechProviderId | null>(null);
  const [dictationMode, setDictationMode] =
    useState<DictationMode>(DEFAULT_DICTATION_MODE);
  const [loopState, setLoopState] = useState<DictationLoopState>(idleState);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlistenProvider: (() => void) | undefined;
    let unlistenSettings: (() => void) | undefined;

    const loadSelectedProvider = async () => {
      try {
        const selectedProvider = await getSelectedSpeechProvider();
        if (!disposed) {
          setProviderId(selectedProvider);
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
          setProviderId("openai");
          setDictationMode(DEFAULT_DICTATION_MODE);
        }
      }
    };

    void loadSelectedProvider();
    void listenToTauriEvent<SpeechProviderId>(
      SPEECH_PROVIDER_CHANGED_EVENT,
      (event) => {
        setProviderId(event.payload);
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
  }, []);

  useEffect(() => {
    latestSessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (session.isRecording) {
      setLoopState({
        ...idleState,
        message: "Recording in progress.",
        state: "recording",
      });
    }
  }, [session.isRecording]);

  useEffect(() => {
    if (
      session.completedMode === "command" &&
      !session.isRecording &&
      !session.focusedFieldError &&
      !session.recorderError
    ) {
      setLoopState(idleState);
    }
  }, [
    session.completedMode,
    session.focusedFieldError,
    session.isRecording,
    session.recorderError,
  ]);

  useEffect(() => {
    if (
      !session.audioBlob ||
      !providerId ||
      session.isRecording ||
      session.focusedFieldError ||
      session.recorderError ||
      session.processingEnabled === false ||
      session.completedMode !== "dictation"
    ) {
      return;
    }

    const audioBlob = session.audioBlob;
    const recordingKey = dictationRecordingKey(session, audioBlob);
    if (lastProcessedKeyRef.current === recordingKey) {
      return;
    }

    lastProcessedKeyRef.current = recordingKey;

    const label = providerLabels[providerId] ?? providerId;
    const isActiveRun = () =>
      mountedRef.current && lastProcessedKeyRef.current === recordingKey;

    const runLoop = async () => {
      const processingStartedAt = isoNow();
      const processingStartedMark = now();
      let transcriptionMs = 0;
      let insertionMs = 0;
      const timeline: DictationTimeline = {
        recordingStartedAt: session.recordingStartedAt,
        recordingStoppedAt: session.recordingEndedAt,
        processingStartedAt,
        providerEvents: [...(session.streamingProviderEvents ?? [])],
        providerRequests: [],
      };
      recordDictationLoopCheckpoint("dictation_loop_processing_started", {
        audioBytes: audioBlob.size,
        completedMode: session.completedMode,
        hasFocusedField: Boolean(session.focusedField),
        providerId,
        trigger: session.dictationTrigger,
      });

      setLoopState({
        error: null,
        insertResult: null,
        message: `Sending audio to ${label}`,
        state: "transcribing",
        transcript: null,
      });

      const captureAnalysis = session.captureAnalysis ?? null;
      const transcriptionSegments = resolveTranscriptionSegments(
        providerId,
        captureAnalysis,
        audioBlob,
      );
      timeline.audioAnalysisCompletedAt = isoNow();
      if (captureAnalysis && shouldSkipBeforeTranscription(captureAnalysis)) {
        const message = captureMessage(captureAnalysis.reason);
        timeline.providerEvents?.push(
          localSpeechGateEvent(providerId, captureAnalysis, "skip"),
        );
        await persistDraft({
          audioBlob,
          processedAudioBlob: captureAnalysis?.processedAudio ?? null,
          provider: {
            modelId: null,
            providerId,
          },
          recording: buildRecordingDiagnostics(
            session.recordingMetrics,
            {
              postProcessingMs: elapsedMs(processingStartedMark),
              transcriptionMs,
              insertionMs,
            },
          ),
          session,
          timeline,
          transcript: {
            characterCount: 0,
            finalText: "",
            rawText: "",
          },
          insertion: {
            errorCode: "speech_unclear",
            errorMessage: message,
            method: null,
            status: "skipped",
          },
        });
        if (isActiveRun()) {
          setLoopState({
            error: {
              kind: "capture",
              message,
            },
            insertResult: null,
            message,
            state: "error",
            transcript: null,
          });
        }
        return;
      }

      let text: string;
      let transcriptionContext:
        | {
            providerId: string;
            modelId: string | null;
          }
        | undefined;
      const streamingTranscript =
        providerId === "assemblyai" &&
        dictationMode !== "standard"
          ? session.streamingTranscript?.trim() ?? ""
          : "";
      let finalStreamingTranscript = streamingTranscript;
      try {
        timeline.transcriptionStartedAt = isoNow();
        const transcriptionStartedAt = now();
        recordDictationLoopCheckpoint("dictation_loop_transcription_started", {
          providerId,
          segmentCount: transcriptionSegments.length,
          streamingFallback: Boolean(providerId === "assemblyai" && session.streamingError),
          dictationMode,
          streamingTranscriptChars: streamingTranscript.length,
        });
        if (
          providerId === "assemblyai" &&
          dictationMode !== "standard" &&
          finalStreamingTranscript.length === 0 &&
          shouldWaitForStreamingFinal(session)
        ) {
          finalStreamingTranscript = await waitForStreamingFinalTranscript(
            latestSessionRef,
            isActiveRun,
            STREAMING_FINAL_WAIT_MS,
          );
        }
        if (finalStreamingTranscript.length > 0) {
          transcriptionContext = {
            providerId,
            modelId: "u3-rt-pro",
          };
          text = finalStreamingTranscript;
          transcriptionMs = elapsedMs(transcriptionStartedAt);
          timeline.transcriptionCompletedAt = isoNow();
        } else {
          if (
            providerId === "assemblyai" &&
            dictationMode === "streaming"
          ) {
            throw new Error(
              session.streamingError
                ? `AssemblyAI streaming failed: ${session.streamingError}`
                : "AssemblyAI streaming did not return a final transcript.",
            );
          }
          if (
            providerId === "assemblyai" &&
            dictationMode !== "standard" &&
            session.streamingError
          ) {
            timeline.providerEvents?.push(
              streamingFallbackAsyncStartedEvent(session.streamingError),
            );
          }
          const transcriptionAttempts = await Promise.all(
            transcriptionSegments.map(async (segmentBlob, segmentIndex) => {
              try {
                const result = await transcribeRecording({
                  providerId,
                  audioBlob: segmentBlob,
                  language: "en",
                });
                const requestTiming = providerRequestTimingFromResult(
                  result,
                  segmentIndex,
                );
                if (requestTiming) {
                  timeline.providerRequests.push(requestTiming);
                }
                if (result.providerEvents && result.providerEvents.length > 0) {
                  timeline.providerEvents?.push(...result.providerEvents);
                }
                return result;
              } catch (err) {
                if (isBlankProviderTranscription(err)) {
                  return null;
                }

                const requestTiming = providerRequestTimingFromError(
                  err,
                  segmentIndex,
                  providerId,
                );
                if (requestTiming) {
                  timeline.providerRequests.push(requestTiming);
                  applyProviderRequestAggregate(timeline);
                } else {
                  applyProviderErrorAggregate(timeline, err);
                }
                return { error: err };
              }
            }),
          );
          transcriptionMs = elapsedMs(transcriptionStartedAt);
          timeline.transcriptionCompletedAt = isoNow();
          applyProviderRequestAggregate(timeline);
          const failedAttempt = transcriptionAttempts.find(isFailedSegmentResult);
          if (failedAttempt) {
            throw failedAttempt.error;
          }
          const transcriptionResults = transcriptionAttempts.filter(
            isTranscriptSegmentResult,
          );
          const firstTranscriptionResult =
            transcriptionResults.find((result) => result !== null) ?? null;
          transcriptionContext = {
            providerId: firstTranscriptionResult?.providerId ?? providerId,
            modelId: firstTranscriptionResult?.model ?? null,
          };
          text = transcriptionResults
            .map((result) => result?.text.trim() ?? "")
            .filter((value) => value.length > 0)
            .join(" ");
        }
        recordDictationLoopCheckpoint("dictation_loop_transcription_completed", {
          modelId: transcriptionContext?.modelId ?? null,
          providerId: transcriptionContext?.providerId ?? providerId,
          textChars: text.trim().length,
        });
      } catch (err) {
        recordDictationLoopCheckpoint("dictation_loop_transcription_failed", {
          error: normalizeError(err),
          providerId,
        });
        if (!isActiveRun()) {
          return;
        }

        await persistDraft({
          audioBlob,
          processedAudioBlob: captureAnalysis?.processedAudio ?? null,
          provider: {
            modelId: null,
            providerId,
          },
          recording: buildRecordingDiagnostics(
            session.recordingMetrics,
            {
              postProcessingMs: elapsedMs(processingStartedMark),
              transcriptionMs,
              insertionMs,
            },
          ),
          session,
          timeline: {
            ...timeline,
            transcriptionCompletedAt:
              timeline.transcriptionCompletedAt ?? isoNow(),
          },
          transcript: {
            characterCount: 0,
            finalText: "",
            rawText: "",
          },
          insertion: {
            errorCode: "transcription_failed",
            errorMessage: `${label}: ${normalizeError(err)}`,
            method: null,
            status: "failed",
          },
        });
        if (isActiveRun()) {
          setLoopState({
            error: {
              kind: "transcription",
              message: `${label}: ${normalizeError(err)}`,
            },
            insertResult: null,
            message: `${label}: ${normalizeError(err)}`,
            state: "error",
            transcript: null,
          });
        }
        return;
      }

      if (!isActiveRun()) {
        recordDictationLoopCheckpoint("dictation_loop_insertion_skipped_inactive", {
          lastProcessedKey: lastProcessedKeyRef.current,
          mounted: mountedRef.current,
          recordingKey,
          textChars: text.trim().length,
        });
        return;
      }

      if (!text.trim()) {
        await persistDraft({
          audioBlob,
          processedAudioBlob: captureAnalysis?.processedAudio ?? null,
          provider: transcriptionContext ?? {
            modelId: null,
            providerId,
          },
          recording: buildRecordingDiagnostics(
            session.recordingMetrics,
            {
              postProcessingMs: elapsedMs(processingStartedMark),
              transcriptionMs,
              insertionMs,
            },
          ),
          session,
          timeline: {
            ...timeline,
            transcriptionCompletedAt:
              timeline.transcriptionCompletedAt ?? isoNow(),
          },
          transcript: {
            characterCount: 0,
            finalText: text,
            rawText: text,
          },
          insertion: {
            errorCode: null,
            errorMessage: null,
            method: null,
            status: "skipped",
          },
        });
        setLoopState({
          error: null,
          insertResult: null,
          message: "Nothing to insert.",
          state: "inserted",
          transcript: text,
        });
        return;
      }

      setLoopState({
        error: null,
        insertResult: null,
        message: "Inserting transcript.",
        state: "inserting",
        transcript: text,
      });

      let insertionStartedAt: number | null = null;
      try {
        timeline.insertionStartedAt = isoNow();
        insertionStartedAt = now();
        recordDictationLoopCheckpoint("dictation_loop_insertion_started", {
          providerId: transcriptionContext?.providerId ?? providerId,
          textChars: text.length,
          timeoutMs: INSERTION_TIMEOUT_MS,
        });
        const insertResult = await withTimeout(
          insertIntoActiveTarget(text),
          INSERTION_TIMEOUT_MS,
          `Insertion timed out after ${INSERTION_TIMEOUT_MS}ms.`,
        );
        insertionMs = elapsedMs(insertionStartedAt);
        timeline.insertionCompletedAt = isoNow();
        recordDictationLoopCheckpoint("dictation_loop_insertion_completed", {
          insertionMs,
          method: insertResult.method,
          providerId: transcriptionContext?.providerId ?? providerId,
        });
        await persistDraft({
          audioBlob,
          processedAudioBlob: captureAnalysis?.processedAudio ?? null,
          provider: transcriptionContext ?? {
            modelId: null,
            providerId,
          },
          recording: buildRecordingDiagnostics(
            session.recordingMetrics,
            {
              postProcessingMs: elapsedMs(processingStartedMark),
              transcriptionMs,
              insertionMs,
            },
          ),
          session,
          timeline,
          transcript: {
            characterCount: text.length,
            finalText: text,
            rawText: text,
          },
          insertion: {
            errorCode: null,
            errorMessage: null,
            method: insertResult.method,
            status: "inserted",
          },
        });
        if (isActiveRun()) {
          setLoopState({
            error: null,
            insertResult,
            message: "Inserted transcript.",
            state: "inserted",
            transcript: text,
          });
        }
      } catch (err) {
        const message = `Insertion failed: ${normalizeError(err)}`;
        insertionMs = insertionStartedAt
          ? Math.max(insertionMs, elapsedMs(insertionStartedAt))
          : insertionMs;
        timeline.insertionCompletedAt = isoNow();
        recordDictationLoopCheckpoint("dictation_loop_insertion_failed", {
          error: normalizeError(err),
          insertionMs,
          providerId: transcriptionContext?.providerId ?? providerId,
        });
        if (isActiveRun()) {
          setLoopState({
            error: {
              kind: "insertion",
              message,
            },
            insertResult: null,
            message,
            state: "error",
            transcript: text,
          });
        }
        await persistDraft({
          audioBlob,
          processedAudioBlob: captureAnalysis?.processedAudio ?? null,
          provider: transcriptionContext ?? {
            modelId: null,
            providerId,
          },
          recording: buildRecordingDiagnostics(
            session.recordingMetrics,
            {
              postProcessingMs: elapsedMs(processingStartedMark),
              transcriptionMs,
              insertionMs,
            },
          ),
          session,
          timeline,
          transcript: {
            characterCount: text.length,
            finalText: text,
            rawText: text,
          },
          insertion: {
            errorCode: "insertion_failed",
            errorMessage: message,
            method: null,
            status: "failed",
          },
        });
      }
    };

    void runLoop();

    return undefined;
  }, [
    providerId,
    dictationMode,
    session.audioBlob,
    session.completedMode,
    session.dictationTrigger,
    session.focusedField,
    session.focusedFieldError,
    session.isRecording,
    session.processingEnabled,
    session.recordingMetrics,
    session.recordingEndedAt,
    session.recordingStartedAt,
    session.recorderError,
    session.streamingError,
    session.streamingProviderEvents,
    session.streamingTranscript,
  ]);

  return useMemo(() => {
    if (session.recorderError) {
      return {
        error: {
          kind: "recording",
          message: session.recorderError,
        },
        insertResult: null,
        message: session.recorderError,
        state: "error",
        transcript: null,
      };
    }

    if (session.focusedFieldError) {
      return {
        error: {
          kind: "focus",
          message: session.focusedFieldError,
        },
        insertResult: null,
        message: session.focusedFieldError,
        state: "error",
        transcript: null,
      };
    }

    if (session.isRecording) {
      return {
        error: null,
        insertResult: null,
        message: "Recording in progress.",
        state: "recording",
        transcript: null,
      };
    }

    return loopState;
  }, [
    loopState,
    session.focusedFieldError,
    session.isRecording,
    session.recorderError,
  ]);
}

function resolveTranscriptionSegments(
  providerId: SpeechProviderId,
  captureAnalysis: CaptureAnalysis | null,
  audioBlob: Blob,
): Blob[] {
  if (shouldPreferRawAudio(providerId, captureAnalysis)) {
    return [audioBlob];
  }
  const segments = captureAnalysis?.transcriptionSegments ?? [];
  return segments.length > 0 ? segments : [audioBlob];
}

function dictationRecordingKey(
  session: DictationLoopSession,
  audioBlob: Blob,
) {
  return [
    session.completedMode,
    session.dictationTrigger,
    session.recordingStartedAt,
    session.recordingEndedAt,
    audioBlob.size,
    audioBlob.type,
  ].join("|");
}

function shouldPreferRawAudio(
  providerId: SpeechProviderId,
  captureAnalysis: CaptureAnalysis | null,
) {
  return (
    providerId === "assemblyai" ||
    shouldFallbackToRawTranscription(captureAnalysis)
  ) && captureAnalysis !== null;
}

function shouldSkipBeforeTranscription(captureAnalysis: CaptureAnalysis) {
  return (
    captureAnalysis.disposition === "unclear" &&
    !shouldFallbackToRawTranscription(captureAnalysis)
  );
}

function localSpeechGateEvent(
  providerId: SpeechProviderId,
  captureAnalysis: CaptureAnalysis,
  decision: "skip" | "allow",
) {
  return {
    durationMs: null,
    eventType: "local_speech_gate",
    metadata: {
      averageDbfs: captureAnalysis.metrics.averageDbfs,
      decision,
      estimatedSnrDb: captureAnalysis.metrics.estimatedSnrDb,
      leadingTrimMs: captureAnalysis.metrics.leadingTrimMs,
      longestPauseMs: captureAnalysis.metrics.longestPauseMs,
      peakDbfs: captureAnalysis.metrics.peakDbfs,
      reason: captureAnalysis.reason,
      trailingTrimMs: captureAnalysis.metrics.trailingTrimMs,
      voicedMs: captureAnalysis.metrics.voicedMs,
    },
    modelId: null,
    providerId,
    providerMode: "async" as const,
    sessionId: null,
    stage: "local_speech_gate",
    status: decision === "skip" ? "skipped" : "succeeded",
  };
}

function streamingFallbackAsyncStartedEvent(reason: string) {
  return {
    durationMs: null,
    eventType: "stream_fallback_async_started",
    metadata: {
      reason,
    },
    modelId: "u3-rt-pro",
    providerId: "assemblyai",
    providerMode: "streaming" as const,
    sessionId: null,
    stage: "fallback_async",
    status: "started",
  };
}

function shouldWaitForStreamingFinal(session: DictationLoopSession) {
  const events = session.streamingProviderEvents ?? [];
  const started = events.some(
    (event) => event.eventType === "stream_session_started",
  );
  const terminal = events.some((event) =>
    [
      "stream_final_received",
      "stream_terminated",
      "stream_error",
      "stream_fallback_async_started",
    ].includes(event.eventType),
  );
  return started && !terminal;
}

async function waitForStreamingFinalTranscript(
  latestSessionRef: RefObject<DictationLoopSession>,
  isActiveRun: () => boolean,
  timeoutMs: number,
) {
  const deadline = now() + timeoutMs;
  while (isActiveRun() && now() < deadline) {
    const transcript = latestSessionRef.current.streamingTranscript?.trim() ?? "";
    if (transcript.length > 0) {
      return transcript;
    }
    if (!shouldWaitForStreamingFinal(latestSessionRef.current)) {
      return "";
    }
    await delay(STREAMING_FINAL_POLL_MS);
  }
  return latestSessionRef.current.streamingTranscript?.trim() ?? "";
}

function shouldFallbackToRawTranscription(captureAnalysis: CaptureAnalysis | null) {
  if (captureAnalysis?.disposition !== "unclear") {
    return false;
  }

  if (captureAnalysis.reason === "no_speech") {
    return false;
  }

  return captureAnalysis.metrics.peakDbfs >= RAW_TRANSCRIPTION_FALLBACK_PEAK_DBFS;
}

function isBlankProviderTranscription(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "invalid_provider_response"
  );
}

function isFailedSegmentResult(
  result: SegmentTranscriptionResult,
): result is { error: unknown } {
  return typeof result === "object" && result !== null && "error" in result;
}

function isTranscriptSegmentResult(
  result: SegmentTranscriptionResult,
): result is Awaited<ReturnType<typeof transcribeRecording>> | null {
  return !isFailedSegmentResult(result);
}

function providerRequestTimingFromResult(
  result: Awaited<ReturnType<typeof transcribeRecording>>,
  segmentIndex: number,
): DictationProviderRequestTiming | null {
  if (!result.providerRequestStartedAt || !result.providerResponseReceivedAt) {
    return null;
  }

  return {
    segmentIndex,
    startedAt: result.providerRequestStartedAt,
    completedAt: result.providerResponseReceivedAt,
    providerId: result.providerId,
    modelId: result.model,
    status: "succeeded",
    errorCode: null,
  };
}

function providerRequestTimingFromError(
  error: unknown,
  segmentIndex: number,
  providerId: string,
): DictationProviderRequestTiming | null {
  if (
    typeof error !== "object" ||
    error === null ||
    !("providerRequestStartedAt" in error) ||
    !("providerResponseReceivedAt" in error)
  ) {
    return null;
  }

  const providerRequestStartedAt = (error as {
    providerRequestStartedAt?: unknown;
  }).providerRequestStartedAt;
  const providerResponseReceivedAt = (error as {
    providerResponseReceivedAt?: unknown;
  }).providerResponseReceivedAt;

  if (
    typeof providerRequestStartedAt !== "string" ||
    typeof providerResponseReceivedAt !== "string"
  ) {
    return null;
  }

  return {
    segmentIndex,
    startedAt: providerRequestStartedAt,
    completedAt: providerResponseReceivedAt,
    providerId,
    modelId: null,
    status: "failed",
    errorCode: providerErrorCode(error),
  };
}

function providerErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function applyProviderRequestAggregate(timeline: DictationTimeline) {
  if (timeline.providerRequests.length === 0) {
    return;
  }

  const sortedByStart = [...timeline.providerRequests].sort((left, right) =>
    left.startedAt.localeCompare(right.startedAt),
  );
  const sortedByCompletion = [...timeline.providerRequests].sort((left, right) =>
    left.completedAt.localeCompare(right.completedAt),
  );

  timeline.providerRequestStartedAt = sortedByStart[0]?.startedAt ?? null;
  timeline.providerResponseReceivedAt =
    sortedByCompletion[sortedByCompletion.length - 1]?.completedAt ?? null;
}

function applyProviderErrorAggregate(
  timeline: DictationTimeline,
  error: unknown,
) {
  if (typeof error !== "object" || error === null) {
    return;
  }

  const providerRequestStartedAt = (error as {
    providerRequestStartedAt?: unknown;
  }).providerRequestStartedAt;
  const providerResponseReceivedAt = (error as {
    providerResponseReceivedAt?: unknown;
  }).providerResponseReceivedAt;

  if (typeof providerRequestStartedAt === "string") {
    timeline.providerRequestStartedAt = providerRequestStartedAt;
  }
  if (typeof providerResponseReceivedAt === "string") {
    timeline.providerResponseReceivedAt = providerResponseReceivedAt;
  }
}

function captureMessage(reason: CaptureReason): string {
  switch (reason) {
    case "no_speech":
      return "No speech detected.";
    case "too_short":
      return "Speech too short. Try speaking a bit longer.";
    case "low_snr":
    case "low_volume":
      return "Speech unclear. Try again closer to the mic.";
    default:
      return "Speech unclear. Try recording again.";
  }
}

async function persistDraft(input: {
  audioBlob: Blob | null;
  processedAudioBlob?: Blob | null;
  provider: DictationRecordDraft["provider"];
  recording?: DictationRecordDraft["recording"];
  session: DictationLoopSession;
  timeline?: DictationTimeline | null;
  transcript: DictationRecordDraft["transcript"];
  insertion: DictationRecordDraft["insertion"];
}) {
  if (!input.session.focusedField || !input.session.dictationTrigger) {
    recordDictationLoopCheckpoint("dictation_loop_persist_skipped", {
      hasFocusedField: Boolean(input.session.focusedField),
      hasTrigger: Boolean(input.session.dictationTrigger),
      insertionStatus: input.insertion.status,
    });
    return;
  }

  try {
    let audio: DictationRecordDraft["audio"] = null;
    let processedAudio: DictationRecordDraft["processedAudio"] = null;
    if (input.audioBlob) {
      try {
        audio = await persistDictationAudio({
          audioBlob: input.audioBlob,
          capturedAt:
            input.session.recordingStartedAt ??
            input.session.recordingEndedAt ??
            new Date().toISOString(),
        });
      } catch (err) {
        console.error("Failed to persist dictation audio", err);
      }
    }
    if (
      input.processedAudioBlob &&
      appEnvironment.exposeProcessedAudioArtifacts
    ) {
      try {
        processedAudio = await persistDictationAudio({
          audioBlob: input.processedAudioBlob,
          capturedAt:
            input.session.recordingStartedAt ??
            input.session.recordingEndedAt ??
            new Date().toISOString(),
        });
      } catch (err) {
        console.error("Failed to persist processed dictation audio", err);
      }
    }

    await saveDictationRecord({
      mode: "dictation",
      trigger: input.session.dictationTrigger,
      capturedAt:
        input.session.recordingStartedAt ??
        input.session.recordingEndedAt ??
        new Date().toISOString(),
      startedAt: input.session.recordingStartedAt,
      endedAt: input.session.recordingEndedAt,
      recording: input.recording ?? input.session.recordingMetrics,
      audio,
      processedAudio,
      target: targetSnapshotFromFocusedField(
        input.session.focusedField,
        classifyInputKind(input.session.focusedField),
      ),
      provider: input.provider,
      transcript: input.transcript,
      insertion: input.insertion,
      timeline: input.timeline
        ? {
            ...input.timeline,
            providerEvents: input.timeline.providerEvents ?? [],
            providerRequests: input.timeline.providerRequests ?? [],
            recordPersistedAt: isoNow(),
          }
        : null,
    });
  } catch (err) {
    console.error("Failed to save dictation record", err);
  }
}

function classifyInputKind(
  field: FocusedFieldInfo,
): DictationRecordDraft["target"]["inputKind"] {
  const haystack = [
    field.controlType,
    field.className,
    field.frameworkId,
    field.controlName,
  ]
    .join(" ")
    .toLowerCase();

  if (
    haystack.includes("terminal") ||
    haystack.includes("termcontrol") ||
    haystack.includes("cascadia")
  ) {
    return "terminal";
  }

  if (field.controlType === "Document") {
    return "editor";
  }

  if (haystack.includes("chrome") || haystack.includes("edge") || haystack.includes("browser")) {
    return "browser";
  }

  if (field.controlType === "Edit" || field.controlType === "Text") {
    return "text";
  }

  return "unknown";
}

function buildRecordingDiagnostics(
  base: DictationRecordingDiagnostics | null,
  overrides: Partial<
    Pick<
      DictationRecordingDiagnostics,
      "transcriptionMs" | "insertionMs" | "postProcessingMs"
    >
  >,
): DictationRecordingDiagnostics | null {
  if (!base) {
    return null;
  }

  return {
    ...base,
    analysisMs: base.analysisMs ?? 0,
    ...overrides,
  };
}

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timerHost = typeof window !== "undefined" ? window : globalThis;
    const timeoutId = timerHost.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    operation.then(resolve, reject).finally(() => {
      timerHost.clearTimeout(timeoutId);
    });
  });
}

function delay(timeoutMs: number) {
  return new Promise<void>((resolve) => {
    const timerHost = typeof window !== "undefined" ? window : globalThis;
    timerHost.setTimeout(resolve, timeoutMs);
  });
}

function recordDictationLoopCheckpoint(
  checkpoint: string,
  detail: Record<string, unknown>,
) {
  const normalizedDetail = Object.entries(detail)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("_");
  void recordStartupCheckpoint({
    windowLabel: "voice-capsule",
    checkpoint,
    detail: normalizedDetail,
  }).catch(() => {});
}

function isoNow() {
  return new Date().toISOString();
}

function elapsedMs(startedAt: number) {
  return Math.max(0, Math.round(now() - startedAt));
}
