import { useEffect, useMemo, useRef, useState } from "react";

import { normalizeError } from "@/lib/errors";
import {
  getSelectedSpeechProvider,
  insertIntoActiveTarget,
  listenToTauriEvent,
  SPEECH_PROVIDER_CHANGED_EVENT,
  transcribeRecording,
  type SpeechProviderId,
  type TextInsertResult,
} from "@/lib/tauri";

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
  completedMode: ActiveMode | null;
  focusedFieldError: string | null;
  isRecording: boolean;
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
      try {
        const result = await transcribeRecording({
          providerId,
          audioBlob,
        });
        text = result.text;
      } catch (err) {
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
        if (!cancelled) {
          const message = `Insertion failed: ${normalizeError(err)}`;
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
    session.focusedFieldError,
    session.isRecording,
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
