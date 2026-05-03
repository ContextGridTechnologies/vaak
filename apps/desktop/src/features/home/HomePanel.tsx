import { useEffect, useMemo, useRef, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  CircleAlertIcon,
  CircleCheckBigIcon,
  CircleSlash2Icon,
  Clock3Icon,
  CopyIcon,
  LoaderCircleIcon,
  type LucideIcon,
  MessageSquareTextIcon,
  NotebookPenIcon,
  PlayIcon,
  SquareTerminalIcon,
  StickyNoteIcon,
} from "lucide-react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/app";
import { appScreenContentClassName } from "@/components/app/AppScreen";
import { Button } from "@/components/ui/button";
import {
  Card,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { AudioPlayback } from "@/features/dictation/components/AudioPlayback";
import {
  exportSavedDictationAudio,
  getRecentDictationRecords,
  isTauriRuntime,
  loadSavedDictationAudio,
  sanitizeTargetControlName,
  type DictationRecord,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";

type ActivityStatus = DictationRecord["insertion"]["status"];
type StatusTone = "success" | "warning" | "error";

type HomeActivity = {
  recordId: string;
  appName: string;
  icon: LucideIcon;
  iconMark: string | null;
  status: ActivityStatus;
  targetName: string;
  inputKindLabel: string;
  transcriptPreview: string;
  providerLabel: string;
  capturedAt: string;
  isLatest: boolean;
  audio: DictationRecord["audio"] | null | undefined;
  processedAudio: DictationRecord["processedAudio"] | null | undefined;
  processingSummary: string | null;
};

const POLL_INTERVAL_MS = 3_000;
const INITIAL_VISIBLE_COUNT = 15;
const VISIBLE_INCREMENT = 15;

const statusMeta: Record<
  ActivityStatus,
  { icon: LucideIcon; label: string; tone: StatusTone }
> = {
  inserted: {
    icon: CircleCheckBigIcon,
    label: "Inserted",
    tone: "success",
  },
  skipped: {
    icon: CircleSlash2Icon,
    label: "Skipped",
    tone: "warning",
  },
  failed: {
    icon: CircleAlertIcon,
    label: "Failed",
    tone: "error",
  },
};

const appIcon: Record<string, LucideIcon> = {
  discord: MessageSquareTextIcon,
  vscode: NotebookPenIcon,
  notepad: StickyNoteIcon,
  terminal: SquareTerminalIcon,
  default: MessageSquareTextIcon,
};

export function HomePanel() {
  const [records, setRecords] = useState<DictationRecord[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasLoadedAllRecords, setHasLoadedAllRecords] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let disposed = false;

    const loadRecords = async () => {
      try {
        const recent = await getRecentDictationRecords(INITIAL_VISIBLE_COUNT, 0);
        if (disposed) {
          return;
        }

        setRecords((current) => mergeRecentRecords(current, recent));
        setHasLoadedAllRecords((current) =>
          current || recent.length < INITIAL_VISIBLE_COUNT,
        );
        setIsLoadingMore(false);
      } catch (error) {
        if (!disposed) {
          console.error("Failed to load dictation records", error);
          setRecords([]);
          setHasLoadedAllRecords(true);
          setIsLoadingMore(false);
        }
      }
    };

    void loadRecords();
    const intervalId = window.setInterval(() => {
      void loadRecords();
    }, POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const activities = useMemo(
    () => records.map((record, index) => mapRecordToActivity(record, index)),
    [records],
  );

  const activityOverview = useMemo(
    () => buildActivityOverview(activities),
    [activities],
  );
  const visibleActivities = activities;
  const hasMoreActivities =
    !hasLoadedAllRecords && activities.length >= INITIAL_VISIBLE_COUNT;

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (
      !sentinel ||
      !hasMoreActivities ||
      isLoadingMore ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) {
        return;
      }

      setIsLoadingMore(true);
    }, {
      root: null,
      rootMargin: "0px 0px 160px 0px",
      threshold: 0.1,
    });

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasMoreActivities, isLoadingMore]);

  useEffect(() => {
    if (!isLoadingMore) {
      return;
    }

    let cancelled = false;

    const loadMoreRecords = async () => {
      try {
        const nextRecords = await getRecentDictationRecords(
          VISIBLE_INCREMENT,
          records.length,
        );

        if (cancelled) {
          return;
        }

        setRecords((current) => [...current, ...nextRecords]);
        setHasLoadedAllRecords(nextRecords.length < VISIBLE_INCREMENT);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load more dictation records", error);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMore(false);
        }
      }
    };

    void loadMoreRecords();

    return () => {
      cancelled = true;
    };
  }, [isLoadingMore, records.length]);

  return (
    <div className="min-h-full bg-background text-foreground">
      <main
        data-testid="app-screen-content"
        className={cn(
          appScreenContentClassName,
          "max-w-[74rem] gap-5 pt-[4.05rem] sm:pt-[5.0625rem] lg:pt-[6.075rem]",
        )}
      >
        <section
          data-testid="voice-activity-shell"
          className="mx-auto w-full max-w-[52rem]"
        >
          <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Voice Activity
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <StatusBadge
                tone="success"
                className="normal-case tracking-normal"
              >
                {activityOverview.insertedCount} inserted
              </StatusBadge>
              <StatusBadge
                tone="warning"
                className="normal-case tracking-normal"
              >
                {activityOverview.skippedCount} skipped
              </StatusBadge>
              <StatusBadge tone="error" className="normal-case tracking-normal">
                {activityOverview.failedCount} failed
              </StatusBadge>
            </div>
          </div>

          {activities.length > 0 ? (
            <div className="flex flex-col gap-3">
              {visibleActivities.map((activity) => (
                <ActivityFeedItem
                  key={activity.recordId}
                  activity={activity}
                />
              ))}
              {hasMoreActivities ? (
                <div
                  ref={loadMoreRef}
                  aria-hidden="true"
                  className="h-4 w-full"
                />
              ) : null}
            </div>
          ) : (
            <Card className="border-border/70 bg-card shadow-sm">
              <Empty className="min-h-[24rem] rounded-xl border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Clock3Icon />
                  </EmptyMedia>
                  <EmptyTitle>Recent activity will appear here</EmptyTitle>
                  <EmptyDescription>
                    Start dictation once and Vaak will keep a local-first trail
                    of recent insertions, skips, and failures.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </Card>
          )}

          <div className="flex flex-col gap-1 px-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              Showing {visibleActivities.length} of {activities.length} captures on this device
            </span>
            <span>
              {activities[0]
                ? `Latest ${formatRelativeTime(activities[0].capturedAt)}`
                : "Waiting for the first capture"}
            </span>
          </div>
          </div>
        </section>
      </main>
    </div>
  );
}

type ActivityFeedItemProps = {
  activity: HomeActivity;
};

function ActivityFeedItem({ activity }: ActivityFeedItemProps) {
  const RowIcon = activity.icon;
  const ActivityStatusIcon = statusMeta[activity.status].icon;
  const shouldShowTargetName =
    activity.targetName.trim().toLocaleLowerCase() !==
    activity.appName.trim().toLocaleLowerCase();
  const [originalAudioUrl, setOriginalAudioUrl] = useState<string | null>(null);
  const [processedAudioUrl, setProcessedAudioUrl] = useState<string | null>(null);
  const [isOriginalAudioOpen, setIsOriginalAudioOpen] = useState(false);
  const [isProcessedAudioOpen, setIsProcessedAudioOpen] = useState(false);
  const [loadingAudioKind, setLoadingAudioKind] = useState<
    "original" | "processed" | null
  >(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    return () => {
      if (originalAudioUrl) {
        URL.revokeObjectURL(originalAudioUrl);
      }
      if (processedAudioUrl) {
        URL.revokeObjectURL(processedAudioUrl);
      }
    };
  }, [originalAudioUrl, processedAudioUrl]);

  useEffect(() => {
    if (copyState !== "copied") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCopyState("idle");
    }, 1500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [copyState]);

  const handlePlayAudio = async (kind: "original" | "processed") => {
    const artifact =
      kind === "original" ? activity.audio : activity.processedAudio;
    const currentUrl = kind === "original" ? originalAudioUrl : processedAudioUrl;
    const setUrl = kind === "original" ? setOriginalAudioUrl : setProcessedAudioUrl;

    if (!artifact) {
      return;
    }

    if (currentUrl) {
      if (kind === "original") {
        setIsOriginalAudioOpen((current) => !current);
      } else {
        setIsProcessedAudioOpen((current) => !current);
      }
      return;
    }

    setLoadingAudioKind(kind);
    setAudioError(null);

    try {
      const savedAudio = await loadSavedDictationAudio(artifact.relativePath);
      const nextAudioUrl = URL.createObjectURL(
        new Blob([savedAudio.audioBytes], {
          type: savedAudio.mimeType,
        }),
      );
      setUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return nextAudioUrl;
      });
      if (kind === "original") {
        setIsOriginalAudioOpen(true);
      } else {
        setIsProcessedAudioOpen(true);
      }
    } catch (error) {
      console.error("Failed to load saved dictation audio", error);
      setAudioError("Audio unavailable");
    } finally {
      setLoadingAudioKind(null);
    }
  };

  const handleCopyTranscript = async () => {
    try {
      await navigator.clipboard.writeText(activity.transcriptPreview);
      setCopyState("copied");
    } catch (error) {
      console.error("Failed to copy transcript", error);
      setCopyState("error");
    }
  };

  const handleDownloadAudio = async (kind: "original" | "processed") => {
    const artifact =
      kind === "original" ? activity.audio : activity.processedAudio;
    if (!artifact) {
      return;
    }

    try {
      const exported = await exportSavedDictationAudio(artifact.relativePath);
      toast.success(`Saved ${exported.fileName}`, {
        description: exported.savedPath,
      });
      await revealItemInDir(exported.savedPath);
    } catch (error) {
      console.error("Failed to export saved dictation audio", error);
      toast.error("Unable to download audio");
    }
  };

  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border/70 bg-card px-4 py-3.5 shadow-sm transition-[border-color,box-shadow,transform] sm:px-5",
        activity.isLatest
          ? "border-border shadow-md"
          : "hover:border-border hover:shadow-md",
      )}
    >
      <div className="flex items-start gap-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background text-muted-foreground shadow-xs">
          {activity.iconMark ? (
            <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-foreground/75">
              {activity.iconMark}
            </span>
          ) : (
            <RowIcon className="size-4.5" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-[1.05rem] font-semibold leading-tight text-foreground">
                {activity.appName}
              </div>
              {shouldShowTargetName ? (
                <div className="mt-0.5 text-sm leading-5 text-muted-foreground">
                  {activity.targetName}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm lg:justify-end">
              <StatusBadge
                tone={statusMeta[activity.status].tone}
                className="normal-case tracking-normal"
              >
                <ActivityStatusIcon data-icon="inline-start" />
                {statusMeta[activity.status].label}
              </StatusBadge>
              <span className="text-sm text-muted-foreground">
                {formatRelativeTime(activity.capturedAt)}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 flex-1 text-sm leading-6 text-foreground/92">
                {activity.transcriptPreview}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="shrink-0 rounded-md px-2"
                onClick={() => {
                  void handleCopyTranscript();
                }}
                aria-label={`Copy transcript for ${activity.appName}`}
                title={copyState === "copied" ? "Copied" : "Copy transcript"}
              >
                <CopyIcon data-icon="inline-start" />
                {copyState === "copied"
                  ? "Copied"
                  : copyState === "error"
                    ? "Retry"
                    : "Copy"}
              </Button>
            </div>
            {/*
              Timing metadata is intentionally hidden for now.
              Keep the formatter and mapped value in place until we decide how
              to surface processing diagnostics in the product later.
            */}
          </div>

          {activity.audio || activity.processedAudio ? (
            <div className="flex flex-col gap-2 border-t border-border/60 pt-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  {activity.audio ? renderAudioControl({
                    appName: activity.appName,
                    byteLength: activity.audio.byteLength,
                    isLoading: loadingAudioKind === "original",
                    isOpen: isOriginalAudioOpen,
                    kind: "original",
                    onClick: () => {
                      void handlePlayAudio("original");
                    },
                  }) : null}
                  {activity.processedAudio ? renderAudioControl({
                    appName: activity.appName,
                    byteLength: activity.processedAudio.byteLength,
                    isLoading: loadingAudioKind === "processed",
                    isOpen: isProcessedAudioOpen,
                    kind: "processed",
                    onClick: () => {
                      void handlePlayAudio("processed");
                    },
                  }) : null}
                </div>
                {/*
                  Input-kind metadata remains hidden for now.
                  Keep the provider/model label visible and revisit the rest of
                  the metadata layout later.
                */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:justify-end">
                  <span>{activity.providerLabel}</span>
                </div>
              </div>
              {audioError ? (
                <div className="text-xs text-destructive">{audioError}</div>
              ) : null}
              {isOriginalAudioOpen ? (
                <AudioPlayback
                  audioUrl={originalAudioUrl}
                  onDownload={() => handleDownloadAudio("original")}
                />
              ) : null}
              {isProcessedAudioOpen ? (
                <AudioPlayback
                  audioUrl={processedAudioUrl}
                  onDownload={() => handleDownloadAudio("processed")}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function renderAudioControl({
  appName,
  byteLength,
  isLoading,
  isOpen,
  kind,
  onClick,
}: {
  appName: string;
  byteLength: number;
  isLoading: boolean;
  isOpen: boolean;
  kind: "original" | "processed";
  onClick: () => void;
}) {
  const label = kind === "original" ? "Original" : "Processed";

  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-muted/15 px-2 py-1">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="h-7 rounded-md px-2.5"
        onClick={onClick}
        disabled={isLoading}
        aria-label={`Play ${kind} audio for ${appName}`}
      >
        {isLoading ? (
          <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
        ) : (
          <PlayIcon data-icon="inline-start" />
        )}
        {isOpen ? `Hide ${label}` : label}
      </Button>
      <span className="text-xs text-muted-foreground">
        {Math.max(1, Math.round(byteLength / 1024))} KB
      </span>
    </div>
  );
}

function buildActivityOverview(activities: HomeActivity[]) {
  const insertedCount = activities.filter(
    (activity) => activity.status === "inserted",
  ).length;
  const skippedCount = activities.filter(
    (activity) => activity.status === "skipped",
  ).length;
  const failedCount = activities.filter(
    (activity) => activity.status === "failed",
  ).length;

  return {
    insertedCount,
    skippedCount,
    failedCount,
  };
}

function mergeRecentRecords(
  currentRecords: DictationRecord[],
  latestRecords: DictationRecord[],
) {
  if (currentRecords.length === 0) {
    return latestRecords;
  }

  const seenRecordIds = new Set(latestRecords.map((record) => record.recordId));
  const olderRecords = currentRecords.filter(
    (record) => !seenRecordIds.has(record.recordId),
  );

  return [...latestRecords, ...olderRecords];
}

function mapRecordToActivity(
  record: DictationRecord,
  index: number,
): HomeActivity {
  const appName = deriveAppName(record);

  return {
    recordId: record.recordId,
    appName,
    icon: appIcon[deriveIconKey(appName)] ?? appIcon.default,
    iconMark: deriveIconMark(record, appName),
    status: record.insertion.status,
    targetName: sanitizeTargetControlName({
      controlName: record.target.controlName,
      controlType: record.target.controlType,
      inputKind: record.target.inputKind,
      frameworkId: record.target.frameworkId,
      className: record.target.className,
    }),
    inputKindLabel: formatInputKind(record.target.inputKind),
    transcriptPreview:
      record.transcript.finalText.trim() || "(empty transcript)",
    providerLabel: formatProviderLabel(record),
    capturedAt: record.capturedAt,
    isLatest: index === 0,
    audio: record.audio,
    processedAudio: record.processedAudio,
    processingSummary: formatProcessingSummary(record),
  };
}

function deriveAppName(record: DictationRecord) {
  const title = record.target.windowTitle.trim();
  const lowerTitle = title.toLowerCase();
  const controlName = record.target.controlName.trim();
  const lowerControlName = controlName.toLowerCase();

  if (lowerTitle.includes("discord")) {
    return "Discord";
  }
  if (
    lowerTitle.includes("visual studio code") ||
    lowerTitle.includes("vs code")
  ) {
    return "Visual Studio Code";
  }
  if (lowerTitle.includes("notepad")) {
    return "Notepad";
  }
  if (
    lowerTitle.includes("terminal") ||
    lowerTitle.includes("powershell") ||
    lowerControlName.includes("powershell")
  ) {
    return lowerControlName.includes("powershell")
      ? "PowerShell"
      : "Windows Terminal";
  }
  if (
    record.target.inputKind === "terminal" &&
    lowerControlName.includes("command")
  ) {
    return "Windows Terminal";
  }
  return title || capitalize(record.platform);
}

function deriveIconKey(appName: string) {
  if (appName === "Discord") return "discord";
  if (appName === "Visual Studio Code") return "vscode";
  if (appName === "Notepad") return "notepad";
  if (appName === "Windows Terminal") return "terminal";
  return "default";
}

function deriveIconMark(record: DictationRecord, appName: string) {
  const title = record.target.windowTitle.toLowerCase();
  const target = record.target.controlName.toLowerCase();

  if (title.includes("powershell") || target.includes("powershell")) {
    return "PS";
  }
  if (appName === "Windows Terminal") {
    return ">_";
  }
  if (appName === "Visual Studio Code") {
    return "VS";
  }
  return null;
}

function formatInputKind(inputKind: string) {
  // Reserved for future activity metadata/product decisions.
  switch (inputKind) {
    case "text":
      return "Text input";
    case "editor":
      return "Editor";
    case "terminal":
      return "Command input";
    case "browser":
      return "Browser input";
    default:
      return capitalize(inputKind) || "Unknown";
  }
}

function formatProviderLabel(record: DictationRecord) {
  // Reserved for future activity metadata/product decisions.
  if (!record.provider) {
    return "Provider unknown";
  }

  const providerName = providerDisplayName[record.provider.providerId];
  const label = providerName || capitalize(record.provider.providerId);

  if (!record.provider.modelId) {
    return label;
  }

  return `${label} · ${record.provider.modelId}`;
}

function formatProcessingSummary(record: DictationRecord) {
  // Reserved for future diagnostics/product decisions around timing visibility.
  const processingMs = record.recording?.postProcessingMs;
  const startupMs = record.recording?.startupMs;
  const analysisMs = record.recording?.analysisMs;
  const transcriptionMs = record.recording?.transcriptionMs;
  const insertionMs = record.recording?.insertionMs;

  const parts = [
    typeof processingMs === "number"
      ? `Post ${formatDurationMs(processingMs)}`
      : null,
    typeof transcriptionMs === "number"
      ? `STT ${formatDurationMs(transcriptionMs)}`
      : null,
    typeof analysisMs === "number"
      ? `Analyze ${formatDurationMs(analysisMs)}`
      : null,
    typeof insertionMs === "number"
      ? `Insert ${formatDurationMs(insertionMs)}`
      : null,
    typeof startupMs === "number"
      ? `Startup ${formatDurationMs(startupMs)}`
      : null,
  ].filter((value): value is string => value !== null);

  return parts.length > 0 ? parts.join(" · ") : null;
}

const providerDisplayName: Record<string, string> = {
  openai: "OpenAI",
  assemblyai: "AssemblyAI",
  deepgram: "Deepgram",
  groq: "Groq",
  elevenlabs: "ElevenLabs",
  azure_openai: "Azure OpenAI",
  "azure-openai": "Azure OpenAI",
};

function formatRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, "hour");
  }

  return formatter.format(Math.round(diffHours / 24), "day");
}

function capitalize(value: string) {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDurationMs(value: number) {
  return `${Math.max(0, Math.round(value))} ms`;
}
