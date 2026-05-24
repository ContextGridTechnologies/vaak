import {
  AlertCircleIcon,
  CheckIcon,
  Loader2Icon,
  MicIcon,
  SquareIcon,
} from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";

import type { DictationLifecycleState } from "@/features/dictation/hooks/useDictationLoop";
import { cn } from "@/lib/utils";

type VoiceCapsuleProps = {
  audioLevel: number;
  message: string;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onToggleRecording: () => void;
  state: DictationLifecycleState;
};

export function VoiceCapsule({
  audioLevel,
  message,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onToggleRecording,
  state,
}: VoiceCapsuleProps) {
  const visualState = getVoiceCapsuleVisualState(state);
  const isRecording = visualState === "recording";
  const isBusy = visualState === "busy";
  const Icon =
    visualState === "error"
      ? AlertCircleIcon
      : isRecording
        ? SquareIcon
        : isBusy
          ? Loader2Icon
          : visualState === "inserted"
            ? CheckIcon
            : MicIcon;

  return (
    <main className="h-full w-full bg-transparent p-1.5">
      <section
        className={cn(
          "flex h-full w-full items-center gap-1 overflow-hidden rounded-full border border-white/15 bg-neutral-950/92 px-[3px] py-[2px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
          visualState === "recording" && "border-emerald-400/45",
          visualState === "busy" && "border-sky-400/35",
          visualState === "inserted" && "border-emerald-400/35",
          visualState === "error" && "border-rose-500/45",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <button
          type="button"
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full border border-white/14 bg-white/14 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-colors hover:bg-white/18 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/55 focus-visible:ring-offset-0",
            visualState === "recording" && "bg-emerald-400/20 text-emerald-100",
            visualState === "busy" && "bg-sky-400/20 text-sky-100",
            visualState === "inserted" && "bg-emerald-400/18 text-emerald-100",
            visualState === "error" && "bg-rose-500/18 text-rose-100",
          )}
          onClick={onToggleRecording}
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

        <div className="flex h-5 min-w-4 items-center justify-center pr-px">
          <VoiceCapsuleMeter audioLevel={audioLevel} state={state} />
        </div>

        <span className="sr-only" aria-live="polite">
          {message}
        </span>
      </section>
    </main>
  );
}

function VoiceCapsuleMeter({
  audioLevel,
  state,
}: {
  audioLevel: number;
  state: DictationLifecycleState;
}) {
  if (state === "recording") {
    return (
      <div
        className="voice-wave-active flex items-end gap-0.5"
        aria-label="Recording wave"
      >
        <span className="voice-wave-bar" style={meterStyle(audioLevel, 0.72)} />
        <span className="voice-wave-bar" style={meterStyle(audioLevel, 1)} />
        <span className="voice-wave-bar" style={meterStyle(audioLevel, 0.84)} />
      </div>
    );
  }

  if (state === "transcribing" || state === "inserting") {
    return (
      <div
        className="voice-wave-active flex items-end gap-0.5"
        aria-label={state === "transcribing" ? "Transcribing audio" : "Inserting text"}
      >
        <span className="voice-wave-bar h-1.5" />
        <span className="voice-wave-bar h-2.5" />
        <span className="voice-wave-bar h-2" />
      </div>
    );
  }

  return (
    <div className="flex items-end gap-0.5 opacity-55" aria-hidden="true">
      <span className="block h-1 w-[2px] rounded-full bg-white/45" />
      <span className="block h-2 w-[2px] rounded-full bg-white/35" />
      <span className="block h-1.5 w-[2px] rounded-full bg-white/25" />
    </div>
  );
}

function getVoiceCapsuleVisualState(state: DictationLifecycleState) {
  if (state === "transcribing" || state === "inserting") {
    return "busy";
  }

  return state;
}

function meterStyle(audioLevel: number, multiplier: number) {
  const height = 6 + Math.round(audioLevel * multiplier * 12);
  return {
    height: `${height}px`,
  };
}
