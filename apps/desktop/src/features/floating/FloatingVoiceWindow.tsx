import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircleIcon, MicIcon, SquareIcon } from "lucide-react";

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

type CapsuleState = "idle" | "listening" | "transcribing" | "error";

const providerLabels: Record<SpeechProviderId, string> = {
  openai: "OpenAI",
  "azure-openai": "Azure OpenAI",
};

export function FloatingVoiceWindow() {
  const session = useDictationSession();
  const lastTranscribedRef = useRef<{
    audioBlob: Blob;
    providerId: SpeechProviderId;
  } | null>(null);
  const [providerId, setProviderId] = useState<SpeechProviderId | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(
    null,
  );
  const [isTranscribing, setIsTranscribing] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.window = "voice-capsule";
    document.body.dataset.window = "voice-capsule";
    document.documentElement.classList.add("dark");
    document.body.classList.add("dark");

    return () => {
      document.documentElement.classList.remove("dark");
      document.body.classList.remove("dark");
    };
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
    return "idle";
  }, [
    isTranscribing,
    session.focusedFieldError,
    session.isRecording,
    session.recorderError,
    transcriptionError,
  ]);

  const message =
    session.recorderError ||
    session.focusedFieldError ||
    transcriptionError ||
    transcript ||
    (state === "transcribing" && providerId
      ? `Sending audio to ${providerLabels[providerId]}`
      : null) ||
    (state === "listening" ? "Recording in progress." : "Recorder ready.");

  const isRecording = state === "listening";
  const Icon =
    state === "error" ? AlertCircleIcon : isRecording ? SquareIcon : MicIcon;

  const handleToggleRecording = () => {
    if (isRecording) {
      session.stopManualRecording();
      return;
    }

    void session.startManualDictation();
  };

  return (
    <main className="h-full w-full bg-transparent p-[2px]">
      <section
        className={cn(
          "flex h-full w-full items-center gap-1 overflow-hidden rounded-full border border-white/10 bg-black/70 p-[2px] text-white shadow-[0_4px_12px_rgba(0,0,0,0.24)] backdrop-blur-xl",
          state === "listening" && "border-emerald-400/45",
          state === "transcribing" && "border-sky-400/35",
          state === "error" && "border-rose-500/45",
        )}
        data-tauri-drag-region
      >
        <button
          type="button"
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white transition-colors hover:bg-white/14 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/55 focus-visible:ring-offset-0",
            state === "listening" && "bg-emerald-400/20 text-emerald-100",
            state === "error" && "bg-rose-500/18 text-rose-100",
          )}
          onClick={handleToggleRecording}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
          aria-pressed={isRecording}
        >
          <Icon className="size-3" aria-hidden="true" />
        </button>

        <div
          className="flex h-5 min-w-4 items-center justify-center pr-px"
          data-tauri-drag-region
        >
          {isRecording ? (
            <div
              className="voice-wave-active flex items-end gap-0.5"
              aria-label="Recording wave"
            >
              <span className="voice-wave-bar h-1.5" />
              <span className="voice-wave-bar h-2.5" />
              <span className="voice-wave-bar h-2" />
            </div>
          ) : (
            <div className="flex items-end gap-0.5 opacity-55" aria-hidden="true">
              <span className="block h-1 w-[2px] rounded-full bg-white/45" />
              <span className="block h-2 w-[2px] rounded-full bg-white/35" />
              <span className="block h-1.5 w-[2px] rounded-full bg-white/25" />
            </div>
          )}
        </div>

        <span className="sr-only" aria-live="polite">
          {message}
        </span>
      </section>
    </main>
  );
}
