import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ClipboardIcon,
  MicIcon,
  PlayIcon,
  SquareIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDictationSession } from "@/features/dictation/hooks/useDictationSession";
import { normalizeError } from "@/lib/errors";
import {
  getSelectedSpeechProvider,
  listenToTauriEvent,
  SPEECH_PROVIDER_CHANGED_EVENT,
  transcribeRecording,
  type SpeechProviderId,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";

type CapsuleState = "idle" | "listening" | "transcribing" | "ready" | "error";
const providerLabels: Record<SpeechProviderId, string> = {
  openai: "OpenAI",
  "azure-openai": "Azure OpenAI",
};

const stateCopy: Record<CapsuleState, { label: string; detail: string }> = {
  idle: {
    label: "Vaak ready",
    detail: "Hold Ctrl + Win",
  },
  listening: {
    label: "Listening",
    detail: "Release to finish",
  },
  transcribing: {
    label: "Transcribing",
    detail: "Sending audio",
  },
  ready: {
    label: "Transcript ready",
    detail: "Copy or play last recording",
  },
  error: {
    label: "Needs attention",
    detail: "Open Vaak settings",
  },
};

export function FloatingVoiceWindow() {
  const session = useDictationSession();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastTranscribedRef = useRef<{
    audioBlob: Blob;
    providerId: SpeechProviderId;
  } | null>(null);
  const [providerId, setProviderId] = useState<SpeechProviderId | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(
    null,
  );
  const [isTranscribing, setIsTranscribing] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.window = "voice-capsule";
    document.body.dataset.window = "voice-capsule";
  }, []);

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
    setIsPlaying(false);
  }, [session.audioUrl]);

  useEffect(() => {
    if (session.isRecording) {
      setTranscript(null);
      setTranscriptionError(null);
    }
  }, [session.isRecording]);

  useEffect(() => {
    if (!session.audioBlob || !providerId) {
      return;
    }

    const lastTranscribed = lastTranscribedRef.current;
    if (
      lastTranscribed?.audioBlob === session.audioBlob &&
      lastTranscribed.providerId === providerId
    ) {
      return;
    }

    lastTranscribedRef.current = {
      audioBlob: session.audioBlob,
      providerId,
    };
    setTranscript(null);
    setTranscriptionError(null);
    setIsTranscribing(true);

    void transcribeRecording({
      providerId,
      audioBlob: session.audioBlob,
    })
      .then((result) => {
        setTranscript(result.text);
      })
      .catch((err: unknown) => {
        setTranscriptionError(
          `${providerLabels[providerId]}: ${normalizeError(err)}`,
        );
      })
      .finally(() => {
        setIsTranscribing(false);
      });
  }, [providerId, session.audioBlob]);

  const state: CapsuleState = useMemo(() => {
    if (session.recorderError || session.focusedFieldError || transcriptionError) {
      return "error";
    }
    if (session.isRecording) {
      return "listening";
    }
    if (isTranscribing) {
      return "transcribing";
    }
    if (transcript || session.audioUrl) {
      return "ready";
    }
    return "idle";
  }, [
    session.focusedFieldError,
    session.isRecording,
    session.recorderError,
    session.audioUrl,
    transcript,
    transcriptionError,
    isTranscribing,
  ]);

  const copy = stateCopy[state];
  const Icon = useMemo(() => {
    if (state === "listening") {
      return MicIcon;
    }
    if (state === "transcribing") {
      return CheckCircle2Icon;
    }
    if (state === "error") {
      return AlertCircleIcon;
    }
    return CheckCircle2Icon;
  }, [state]);
  const message =
    session.recorderError ||
    session.focusedFieldError ||
    transcriptionError ||
    transcript ||
    session.focusedField?.windowTitle ||
    (state === "transcribing" && providerId
      ? `Sending audio to ${providerLabels[providerId]}`
      : null) ||
    (!providerId ? "Loading provider" : null) ||
    copy.detail;

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || !session.audioUrl) {
      return;
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    await audio.play();
    setIsPlaying(true);
  };

  const copyTranscript = async () => {
    if (!transcript) {
      return;
    }
    await navigator.clipboard.writeText(transcript);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-transparent p-2">
      <section
        className={cn(
          "flex h-[60px] w-[304px] items-center gap-3 rounded-lg border border-border bg-card/95 px-3 text-card-foreground shadow-lg backdrop-blur",
          state === "listening" && "border-primary/40",
          state === "error" && "border-destructive/40",
        )}
        data-tauri-drag-region
        aria-live="polite"
      >
        <div
          className={cn(
            "grid size-9 place-items-center rounded-md border border-border bg-muted text-muted-foreground",
            state === "listening" && "bg-primary text-primary-foreground",
            state === "transcribing" && "text-primary",
            state === "error" && "text-destructive",
          )}
          data-tauri-drag-region
        >
          <Icon
            className={cn(
              state === "transcribing" && "animate-pulse",
              session.status === "stopped" && state === "ready" && "text-success",
            )}
            aria-hidden="true"
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col" data-tauri-drag-region>
          <span className="truncate text-sm font-semibold leading-5">
            {copy.label}
          </span>
          <span className="truncate text-xs leading-4 text-muted-foreground">
            {message}
          </span>
        </div>

        {transcript ? (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="size-8 shrink-0"
            onClick={copyTranscript}
            aria-label="Copy transcript"
          >
            <ClipboardIcon data-icon="icon" aria-hidden="true" />
          </Button>
        ) : null}

        {session.audioUrl ? (
          <>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="size-8 shrink-0"
              onClick={togglePlayback}
              aria-label={isPlaying ? "Stop playback" : "Play last recording"}
            >
              {isPlaying ? (
                <SquareIcon data-icon="icon" aria-hidden="true" />
              ) : (
                <PlayIcon data-icon="icon" aria-hidden="true" />
              )}
            </Button>
            <audio
              ref={audioRef}
              src={session.audioUrl}
              onEnded={() => setIsPlaying(false)}
              onPause={() => setIsPlaying(false)}
            >
              <track
                kind="captions"
                src="data:text/vtt,WEBVTT"
                srcLang="en"
                label="captions"
                default
              />
            </audio>
          </>
        ) : null}

        <div
          className={cn(
            "size-2 rounded-full bg-muted-foreground",
            state === "listening" && "bg-primary",
            state === "transcribing" && "bg-warning",
            state === "ready" && "bg-success",
            state === "error" && "bg-destructive",
          )}
          aria-hidden="true"
        />
      </section>
    </main>
  );
}
