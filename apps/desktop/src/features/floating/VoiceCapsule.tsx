import {
  AlertCircleIcon,
  CheckIcon,
  Loader2Icon,
  MicIcon,
  CopyIcon,
  ExternalLinkIcon,
  SquareIcon,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DictationLifecycleState } from "@/features/dictation/hooks/useDictationLoop";
import {
  openMainWindow,
  setVoiceCapsuleSizeMode,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";

type VoiceCapsuleProps = {
  audioLevel: number;
  canRecoverInsertion: boolean;
  message: string;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onToggleRecording: () => void;
  state: DictationLifecycleState;
  transcript: string | null;
};

type RecoveryStatus =
  | "idle"
  | "copying"
  | "copied"
  | "copyFailed"
  | "openFailed"
  | "resizeFailed";

type RecoverySide = "above" | "below";
type RecoveryHorizontalPlacement = "left" | "right";

const RECOVERY_AUTO_CLOSE_MS = 10_000;
const RECOVERY_SUCCESS_CLOSE_MS = 1_500;

export function VoiceCapsule({
  audioLevel,
  canRecoverInsertion,
  message,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onToggleRecording,
  state,
  transcript,
}: VoiceCapsuleProps) {
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoverySide, setRecoverySide] = useState<RecoverySide>("below");
  const [recoveryHorizontalPlacement, setRecoveryHorizontalPlacement] =
    useState<RecoveryHorizontalPlacement>("left");
  const [recoveryStatus, setRecoveryStatus] =
    useState<RecoveryStatus>("idle");
  const previousTranscriptRef = useRef<string | null>(null);
  const visualState = getVoiceCapsuleVisualState(state);
  const isRecording = visualState === "recording";
  const isBusy = visualState === "busy";
  const recoverableTranscript = canRecoverInsertion ? transcript?.trim() : "";
  const showRecovery = Boolean(canRecoverInsertion && recoverableTranscript);
  const recoveryVisible = showRecovery && recoveryOpen;
  const recoveryMessage = getRecoveryMessage(recoveryStatus);
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

  useEffect(() => {
    if (!showRecovery) {
      setRecoveryOpen(false);
      setRecoveryStatus("idle");
      previousTranscriptRef.current = null;
      void setVoiceCapsuleSizeMode("compact").catch(() => {
        setRecoveryStatus("resizeFailed");
      });
      return;
    }

    if (previousTranscriptRef.current !== recoverableTranscript) {
      previousTranscriptRef.current = recoverableTranscript ?? null;
      setRecoveryStatus("idle");
      setRecoveryOpen(true);
    }
  }, [recoverableTranscript, showRecovery]);

  useEffect(() => {
    if (!showRecovery) {
      return;
    }

    if (recoveryOpen) {
      void setVoiceCapsuleSizeMode("insertionRecoveryOpen")
        .then((result) => {
          setRecoverySide(result.popupPlacement);
          setRecoveryHorizontalPlacement(
            result.popupHorizontalPlacement ?? "left",
          );
        })
        .catch(() => {
          setRecoveryStatus("resizeFailed");
        });
      return;
    }

    void setVoiceCapsuleSizeMode(
      compactModeForRecovery(recoverySide, recoveryHorizontalPlacement),
    ).catch(() => {
      setRecoveryStatus("resizeFailed");
    });
  }, [recoveryHorizontalPlacement, recoveryOpen, recoverySide, showRecovery]);

  useEffect(() => {
    if (!showRecovery || !recoveryOpen) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setRecoveryOpen(false);
      setRecoveryStatus("idle");
    }, RECOVERY_AUTO_CLOSE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [recoveryOpen, recoveryStatus, showRecovery]);

  const closeAfterConfirmation = () => {
    window.setTimeout(() => {
      setRecoveryOpen(false);
      setRecoveryStatus("idle");
    }, RECOVERY_SUCCESS_CLOSE_MS);
  };

  const handleCopyTranscript = async () => {
    if (!recoverableTranscript) {
      return;
    }

    setRecoveryStatus("copying");
    try {
      await navigator.clipboard.writeText(recoverableTranscript);
      setRecoveryStatus("copied");
      closeAfterConfirmation();
    } catch {
      setRecoveryStatus("copyFailed");
    }
  };

  const handleOpenVoice = async () => {
    try {
      await openMainWindow();
      setRecoveryOpen(false);
      setRecoveryStatus("idle");
    } catch {
      setRecoveryStatus("openFailed");
    }
  };

  return (
    <main
      className={cn(
        "relative flex h-full w-full bg-transparent p-1.5",
        recoveryVisible && recoveryHorizontalPlacement === "right"
          ? "items-end"
          : "items-start",
        recoveryVisible && recoverySide === "above"
          ? "flex-col justify-end"
          : "flex-col",
      )}
    >
      {recoveryVisible && recoverySide === "above" ? (
        <RecoveryTray
          onCopyTranscript={handleCopyTranscript}
          onOpenVoice={handleOpenVoice}
          recoveryMessage={recoveryMessage}
          recoveryStatus={recoveryStatus}
          side="above"
        />
      ) : null}
      <section
        className={cn(
          "flex h-6 items-center gap-1 overflow-hidden rounded-full border border-white/15 bg-neutral-950/92 px-[3px] py-[2px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
          recoveryVisible ? "w-11 shrink-0" : "h-full w-full",
          showRecovery && "cursor-pointer",
          visualState === "recording" && "border-emerald-400/45",
          visualState === "busy" && "border-sky-400/35",
          visualState === "inserted" && "border-emerald-400/35",
          visualState === "error" && "border-rose-500/45",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={() => {
          if (showRecovery) {
            setRecoveryOpen(true);
          }
        }}
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

      {recoveryVisible && recoverySide === "below" ? (
        <RecoveryTray
          onCopyTranscript={handleCopyTranscript}
          onOpenVoice={handleOpenVoice}
          recoveryMessage={recoveryMessage}
          recoveryStatus={recoveryStatus}
          side="below"
        />
      ) : null}
    </main>
  );
}

function RecoveryTray({
  onCopyTranscript,
  onOpenVoice,
  recoveryMessage,
  recoveryStatus,
  side,
}: {
  onCopyTranscript: () => void;
  onOpenVoice: () => void;
  recoveryMessage: string | null;
  recoveryStatus: RecoveryStatus;
  side: RecoverySide;
}) {
  const busy = recoveryStatus === "copying";

  return (
    <Card
      size="sm"
      className={cn(
        "w-76 gap-2 rounded-lg bg-popover py-2 text-popover-foreground ring-border/80 shadow-xl shadow-foreground/10",
        side === "above" ? "mb-2" : "mt-2",
      )}
      role="dialog"
      aria-label="Transcript ready"
      data-side={side}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onPointerCancel={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <CardHeader>
        <CardTitle className="text-sm">Transcript ready</CardTitle>
        <CardAction>
          <Badge variant="secondary" className="gap-1.5">
            <span>Auto-closes</span>
            <span className="text-muted-foreground">10s</span>
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-2">
        {recoveryMessage ? (
          <p
            className={cn(
              "rounded-md border px-2.5 py-2 text-xs leading-snug",
              getRecoveryMessageClasses(recoveryStatus),
            )}
            aria-live="polite"
          >
            {recoveryMessage}
          </p>
        ) : null}
        <Button
          type="button"
          size="sm"
          className="w-full"
          onClick={onCopyTranscript}
          disabled={busy}
          aria-label="Copy transcript"
        >
          <CopyIcon data-icon="inline-start" aria-hidden="true" />
          Copy
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="w-full"
          onClick={onOpenVoice}
          disabled={busy}
          aria-label="Open Voice"
        >
          <ExternalLinkIcon data-icon="inline-start" aria-hidden="true" />
          Open Voice
        </Button>
      </CardContent>
    </Card>
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

function getRecoveryMessage(status: RecoveryStatus) {
  switch (status) {
    case "copied":
      return "Copied";
    case "copyFailed":
      return "Copy failed. Open Voice instead.";
    case "openFailed":
      return "Could not open Voice. Copy instead.";
    case "resizeFailed":
      return "Could not resize recovery popup.";
    case "copying":
      return "Copying...";
    case "idle":
      return null;
  }
}

function getRecoveryMessageClasses(status: RecoveryStatus) {
  switch (status) {
    case "copied":
      return "border-success/20 bg-success/10 text-success";
    case "copyFailed":
    case "openFailed":
    case "resizeFailed":
      return "border-destructive/20 bg-destructive/10 text-destructive";
    case "copying":
      return "border-primary/20 bg-primary/10 text-primary";
    case "idle":
      return "border-border bg-muted text-muted-foreground";
  }
}

function compactModeForRecovery(
  side: RecoverySide,
  horizontalPlacement: RecoveryHorizontalPlacement,
) {
  if (side === "above" && horizontalPlacement === "right") {
    return "compactFromRecoveryAboveRight";
  }

  if (horizontalPlacement === "right") {
    return "compactFromRecoveryRight";
  }

  if (side === "above") {
    return "compactFromRecoveryAbove";
  }

  return "compact";
}
