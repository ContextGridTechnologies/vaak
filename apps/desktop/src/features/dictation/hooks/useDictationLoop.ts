import { useEffect, useMemo, useRef, useState } from "react";

import { appEnvironment } from "@/config/app-env";
import { normalizeError } from "@/lib/errors";
import {
  getSelectedSpeechProvider,
  insertIntoActiveTarget,
  listenToTauriEvent,
  persistDictationAudio,
  saveDictationRecord,
  type DictationRecordingDiagnostics,
  SPEECH_PROVIDER_CHANGED_EVENT,
  targetSnapshotFromFocusedField,
  transcribeRecording,
  type DictationRecordDraft,
  type DictationProviderRequestTiming,
  type DictationTimeline,
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
const RAW_TRANSCRIPTION_FALLBACK_PEAK_DBFS = -24;

export function useDictationLoop(
  session: DictationLoopSession,
): DictationLoopState {
  const lastProcessedRef = useRef<Blob | null>(null);
  const [providerId, setProviderId] = useState<SpeechProviderId | null>(null);
  const [loopState, setLoopState] = useState<DictationLoopState>(idleState);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    const loadSelectedProvider = async () => {
      try {
        const selectedProvider = await getSelectedSpeechProvider();
        if (!disposed) {
          setProviderId(selectedProvider);
        }
      } catch {
        if (!disposed) {
          setProviderId("openai");
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
      unlisten = detach;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

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
    const lastProcessed = lastProcessedRef.current;
    if (lastProcessed === audioBlob) {
      return;
    }

    lastProcessedRef.current = audioBlob;

    let cancelled = false;
    const label = providerLabels[providerId] ?? providerId;

    const runLoop = async () => {
      const processingStartedAt = isoNow();
      const processingStartedMark = now();
      let transcriptionMs = 0;
      let insertionMs = 0;
      const timeline: DictationTimeline = {
        recordingStartedAt: session.recordingStartedAt,
        recordingStoppedAt: session.recordingEndedAt,
        processingStartedAt,
        providerRequests: [],
      };

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
        if (!cancelled) {
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
      try {
        timeline.transcriptionStartedAt = isoNow();
        const transcriptionStartedAt = now();
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
      } catch (err) {
        if (cancelled) {
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
        if (!cancelled) {
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

      if (cancelled) {
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

      try {
        timeline.insertionStartedAt = isoNow();
        const insertionStartedAt = now();
        const insertResult = await insertIntoActiveTarget(text);
        insertionMs = elapsedMs(insertionStartedAt);
        timeline.insertionCompletedAt = isoNow();
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
        if (!cancelled) {
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
        timeline.insertionCompletedAt = isoNow();
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
        if (!cancelled) {
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
      }
    };

    void runLoop();

    return () => {
      cancelled = true;
    };
  }, [
    providerId,
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

function isoNow() {
  return new Date().toISOString();
}

function elapsedMs(startedAt: number) {
  return Math.max(0, Math.round(now() - startedAt));
}
