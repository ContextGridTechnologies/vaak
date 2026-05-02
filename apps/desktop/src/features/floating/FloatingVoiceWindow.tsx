import { useEffect } from "react";
import {
  AlertCircleIcon,
  CheckIcon,
  Loader2Icon,
  MicIcon,
  SquareIcon,
} from "lucide-react";

import { useDictationLoop } from "@/features/dictation/hooks/useDictationLoop";
import { useDictationSession } from "@/features/dictation/hooks/useDictationSession";
import { cn } from "@/lib/utils";

export function FloatingVoiceWindow() {
  const session = useDictationSession();
  const dictation = useDictationLoop(session);

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

  const state = dictation.state;
  const message = dictation.message;
  const isRecording = state === "recording";
  const isBusy = state === "transcribing" || state === "inserting";
  const Icon =
    state === "error"
      ? AlertCircleIcon
      : isRecording
        ? SquareIcon
        : isBusy
          ? Loader2Icon
          : state === "inserted"
            ? CheckIcon
            : MicIcon;

  const handleToggleRecording = () => {
    if (isBusy) {
      return;
    }

    if (isRecording) {
      session.stopManualRecording();
      return;
    }

    void session.startManualDictation();
  };

  return (
    <main className="h-full w-full bg-transparent p-1.5">
      <section
        className={cn(
          "flex h-full w-full items-center gap-1 overflow-hidden rounded-full border border-white/15 bg-neutral-950/92 px-[3px] py-[2px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
          state === "recording" && "border-emerald-400/45",
          isBusy && "border-sky-400/35",
          state === "inserted" && "border-emerald-400/35",
          state === "error" && "border-rose-500/45",
        )}
        data-tauri-drag-region
      >
        <button
          type="button"
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full border border-white/14 bg-white/14 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-colors hover:bg-white/18 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/55 focus-visible:ring-offset-0",
            state === "recording" && "bg-emerald-400/20 text-emerald-100",
            isBusy && "bg-sky-400/20 text-sky-100",
            state === "inserted" && "bg-emerald-400/18 text-emerald-100",
            state === "error" && "bg-rose-500/18 text-rose-100",
          )}
          onClick={handleToggleRecording}
          disabled={isBusy}
          aria-label={
            isRecording
              ? "Stop recording"
              : isBusy
                ? "Dictation busy"
                : "Start recording"
          }
          aria-pressed={isRecording}
        >
          <Icon
            className={cn("size-3", isBusy && "animate-spin")}
            aria-hidden="true"
          />
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
          ) : isBusy ? (
            <div
              className="voice-wave-active flex items-end gap-0.5"
              aria-label={
                state === "transcribing" ? "Transcribing audio" : "Inserting text"
              }
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
