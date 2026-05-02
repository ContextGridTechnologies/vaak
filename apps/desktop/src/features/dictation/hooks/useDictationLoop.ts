import { useEffect, useMemo, useRef, useState } from "react";

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
  | "focus"
  | "transcription"
  | "insertion";

export type DictationLoopError = {
  kind: DictationLoopErrorKind;
  message: string;
};

type ActiveMode = "idle" | "dictation" | "command";

export type DictationLoopSession = {
  audioBlob: Blob | null;
  dictationTrigger: "hotkey" | "manual" | null;
  completedMode: ActiveMode | null;
  focusedField: FocusedFieldInfo | null;
  focusedFieldError: string | null;
  isRecording: boolean;
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
  elevenlabs: "ElevenLabs",
};

const idleState: DictationLoopState = {
  error: null,
  insertResult: null,
  message: "Recorder ready.",
  state: "idle",
  transcript: null,
};

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
      setLoopState({
        error: null,
        insertResult: null,
        message: `Sending audio to ${label}`,
        state: "transcribing",
        transcript: null,
      });

      let text: string;
      let transcriptionResult: Awaited<ReturnType<typeof transcribeRecording>>;
      try {
        transcriptionResult = await transcribeRecording({
          providerId,
          audioBlob,
          language: "en",
        });
        text = transcriptionResult.text;
      } catch (err) {
        await persistDraft({
          audioBlob,
          provider: {
            modelId: null,
            providerId,
          },
          session,
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
          provider: {
            modelId: transcriptionResult.model,
            providerId: transcriptionResult.providerId,
          },
          session,
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
        const insertResult = await insertIntoActiveTarget(text);
        await persistDraft({
          audioBlob,
          provider: {
            modelId: transcriptionResult.model,
            providerId: transcriptionResult.providerId,
          },
          session,
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
        await persistDraft({
          audioBlob,
          provider: {
            modelId: transcriptionResult.model,
            providerId: transcriptionResult.providerId,
          },
          session,
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

async function persistDraft(input: {
  audioBlob: Blob | null;
  provider: DictationRecordDraft["provider"];
  session: DictationLoopSession;
  transcript: DictationRecordDraft["transcript"];
  insertion: DictationRecordDraft["insertion"];
}) {
  if (!input.session.focusedField || !input.session.dictationTrigger) {
    return;
  }

  try {
    let audio: DictationRecordDraft["audio"] = null;
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

    await saveDictationRecord({
      mode: "dictation",
      trigger: input.session.dictationTrigger,
      capturedAt:
        input.session.recordingStartedAt ??
        input.session.recordingEndedAt ??
        new Date().toISOString(),
      startedAt: input.session.recordingStartedAt,
      endedAt: input.session.recordingEndedAt,
      recording: input.session.recordingMetrics,
      audio,
      target: targetSnapshotFromFocusedField(
        input.session.focusedField,
        classifyInputKind(input.session.focusedField),
      ),
      provider: input.provider,
      transcript: input.transcript,
      insertion: input.insertion,
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
