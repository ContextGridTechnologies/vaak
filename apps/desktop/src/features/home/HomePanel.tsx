import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CircleAlertIcon,
  CircleCheckBigIcon,
  CircleSlash2Icon,
  Clock3Icon,
  CopyIcon,
  CheckIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
  type LucideIcon,
  MessageSquareTextIcon,
  NotebookPenIcon,
  PauseIcon,
  PlayIcon,
  SquareTerminalIcon,
  StickyNoteIcon,
} from "lucide-react";

import { StatusBadge } from "@/components/app";
import { appScreenContentClassName } from "@/components/app/AppScreen";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
} from "@/components/ui/card";
import { appEnvironment } from "@/config/app-env";
import {
  TimeSavedHero,
  refreshAnalyticsSnapshot,
  useAnalyticsSnapshot,
} from "@/features/analytics";
import { normalizeError } from "@/lib/errors";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  getRecentDictationRecords,
  getSystemSettings,
  isTauriRuntime,
  loadSavedDictationAudio,
  persistDictationAudio,
  sanitizeTargetControlName,
  transcribeRecording,
  updateDictationRecord,
  type DictationRecord,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";

import { analyzeAudioForRetry } from "./retryAudioProcessing";

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
  sourceRecord: DictationRecord;
};

const POLL_INTERVAL_MS = 3_000;
const INITIAL_VISIBLE_COUNT = 15;
const VISIBLE_INCREMENT = 15;
const COLLAPSED_TRANSCRIPT_LIMIT = 280;

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
  recovered: {
    icon: CircleCheckBigIcon,
    label: "Recovered",
    tone: "success",
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
  const [showSkippedTranscripts, setShowSkippedTranscripts] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasLoadedAllRecords, setHasLoadedAllRecords] = useState(false);
  const [activityLoadError, setActivityLoadError] = useState<string | null>(null);
  const [retryingRecordIds, setRetryingRecordIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [retryErrors, setRetryErrors] = useState<Record<string, string>>({});
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const hasLoadedInitialActivityRef = useRef(false);
  const { summary: productivitySummary } = useAnalyticsSnapshot();

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let disposed = false;

    getSystemSettings()
      .then((settings) => {
        if (!disposed) {
          setShowSkippedTranscripts(settings.showSkippedTranscripts);
        }
      })
      .catch((error) => {
        if (!disposed) {
          console.error("Failed to load system settings", error);
        }
      });

    const loadRecords = async () => {
      try {
        const recent = await getRecentDictationRecords(INITIAL_VISIBLE_COUNT, 0);
        if (disposed) {
          return;
        }

        setRecords((current) => {
          const nextRecords = mergeRecentRecords(current, recent);
          if (
            hasLoadedInitialActivityRef.current &&
            hasRecordSetChanged(current, nextRecords)
          ) {
            void refreshAnalyticsSnapshot();
          }
          hasLoadedInitialActivityRef.current = true;
          return nextRecords;
        });
        setActivityLoadError(null);
        setHasLoadedAllRecords((current) =>
          current || recent.length < INITIAL_VISIBLE_COUNT,
        );
        setIsLoadingMore(false);
      } catch (error) {
        if (!disposed) {
          console.error("Failed to load dictation records", error);
          setActivityLoadError(normalizeError(error));
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
    () =>
      records
        .filter(
          (record) =>
            showSkippedTranscripts || record.insertion.status !== "skipped",
        )
        .map((record, index) => mapRecordToActivity(record, index)),
    [records, showSkippedTranscripts],
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

  const retryActivityTranscription = async (activity: HomeActivity) => {
    if (!activity.audio || !activity.sourceRecord.provider) {
      return;
    }

    setRetryErrors((current) => ({ ...current, [activity.recordId]: "" }));
    setRetryingRecordIds((current) => new Set(current).add(activity.recordId));

    try {
      const retryCapturedAt = new Date().toISOString();
      const savedAudio = await loadSavedDictationAudio(activity.audio.relativePath);
      const originalAudioBlob = new Blob([savedAudio.audioBytes], {
        type: savedAudio.mimeType,
      });
      const providerId = normalizeProviderId(
        activity.sourceRecord.provider.providerId,
      );
      const reprocessedAudio = await analyzeAudioForRetry(originalAudioBlob).catch(
        (error) => {
          console.error("Failed to reprocess retry audio", error);
          return null;
        },
      );
      const transcription = await transcribeRetryAudio({
        model: activity.sourceRecord.provider.modelId ?? undefined,
        providerId,
        reprocessedAudio,
        fallbackAudioBlob: originalAudioBlob,
      });
      const retryProcessedAudio = await persistRetryProcessedAudio({
        audioBlob: reprocessedAudio?.processedAudio ?? null,
        capturedAt: retryCapturedAt,
        fallback: activity.sourceRecord.processedAudio ?? null,
      });
      const retryRecord = await updateDictationRecord(activity.recordId, {
        recording: activity.sourceRecord.recording ?? null,
        processedAudio: retryProcessedAudio,
        provider: {
          providerId: transcription.providerId ?? providerId,
          modelId: transcription.model ?? activity.sourceRecord.provider.modelId,
        },
        transcript: {
          rawText: transcription.text,
          finalText: transcription.text,
          characterCount: transcription.text.length,
        },
        insertion: {
          errorCode: transcription.text.length > 0 ? null : "empty_retry_transcript",
          errorMessage:
            transcription.text.length > 0 ? null : "Retry returned an empty transcript.",
          method: null,
          status: transcription.text.length > 0 ? "recovered" : "skipped",
        },
      });

      setRecords((current) => replaceRecord(current, retryRecord));
      void refreshAnalyticsSnapshot();
      setRetryErrors((current) => ({ ...current, [activity.recordId]: "" }));
    } catch (error) {
      setRetryErrors((current) => ({
        ...current,
        [activity.recordId]: normalizeError(error),
      }));
    } finally {
      setRetryingRecordIds((current) => {
        const next = new Set(current);
        next.delete(activity.recordId);
        return next;
      });
    }
  };

  return (
    <div className="min-h-full text-foreground">
      <main
        data-testid="app-screen-content"
        className={cn(
          appScreenContentClassName,
          "max-w-[86rem] gap-4",
        )}
      >
        <section
          data-testid="voice-productivity-hero"
          className="w-full"
        >
          <TimeSavedHero summary={productivitySummary} />
        </section>

        <section
          data-testid="voice-activity-shell"
          className="mt-2 w-full lg:mt-4"
        >
          <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-2 pb-2 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="h-4 w-1 rounded-full bg-primary/85" />
                <h2 className="text-[1.55rem] font-semibold leading-tight tracking-tight text-foreground">
                  Voice Activity
                </h2>
              </div>
              <p className="text-[0.9rem] text-muted-foreground">
                Recent local dictation captures from this desktop.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <StatusBadge
                tone="success"
                className="border-success/30 bg-success/12 px-2.5 normal-case tracking-normal"
              >
                {activityOverview.insertedCount} inserted
              </StatusBadge>
              {showSkippedTranscripts ? (
                <StatusBadge
                  tone="warning"
                  className="border-warning/45 bg-warning/18 px-2.5 normal-case tracking-normal"
                >
                  {activityOverview.skippedCount} skipped
                </StatusBadge>
              ) : null}
              <StatusBadge tone="error" className="border-destructive/30 bg-destructive/12 px-2.5 normal-case tracking-normal">
                {activityOverview.failedCount} failed
              </StatusBadge>
            </div>
          </div>

          {activityLoadError ? (
            <Alert variant="destructive">
              <AlertTitle>Activity unavailable</AlertTitle>
              <AlertDescription>{activityLoadError}</AlertDescription>
            </Alert>
          ) : null}

          {activities.length > 0 ? (
            <div className="overflow-hidden rounded-lg border-y border-border/80 bg-card shadow-xs">
              {visibleActivities.map((activity) => (
                <ActivityFeedItem
                  key={activity.recordId}
                  activity={activity}
                  isRetrying={retryingRecordIds.has(activity.recordId)}
                  retryError={retryErrors[activity.recordId]}
                  onRetryTranscription={retryActivityTranscription}
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
          ) : activityLoadError ? null : (
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

          <div className="flex flex-col gap-1 border-t border-border/70 px-1 pt-3 text-xs font-medium text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
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
  isRetrying?: boolean;
  retryError?: string;
  onRetryTranscription: (activity: HomeActivity) => void;
};

function ActivityFeedItem({
  activity,
  isRetrying = false,
  retryError,
  onRetryTranscription,
}: ActivityFeedItemProps) {
  const RowIcon = activity.icon;
  const ActivityStatusIcon = statusMeta[activity.status].icon;
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const processedAudioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const [originalAudioUrl, setOriginalAudioUrl] = useState<string | null>(null);
  const [processedAudioUrl, setProcessedAudioUrl] = useState<string | null>(null);
  const [isOriginalAudioOpen, setIsOriginalAudioOpen] = useState(false);
  const [isProcessedAudioOpen, setIsProcessedAudioOpen] = useState(false);
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isLoadingProcessedAudio, setIsLoadingProcessedAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const processedAudio =
    appEnvironment.enableDebugUi && appEnvironment.exposeProcessedAudioArtifacts
      ? activity.processedAudio
      : null;
  const canExpandTranscript =
    activity.transcriptPreview.length > COLLAPSED_TRANSCRIPT_LIMIT;
  const canRetryTranscription =
    activity.status === "failed" &&
    Boolean((activity.processedAudio ?? activity.audio) && activity.sourceRecord.provider);

  useEffect(() => {
    return () => {
      audioPlayerRef.current?.pause();
      audioPlayerRef.current = null;
      processedAudioPlayerRef.current?.pause();
      processedAudioPlayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (originalAudioUrl) {
        URL.revokeObjectURL(originalAudioUrl);
      }
    };
  }, [originalAudioUrl]);

  useEffect(() => {
    return () => {
      if (processedAudioUrl) {
        URL.revokeObjectURL(processedAudioUrl);
      }
    };
  }, [processedAudioUrl]);

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

  const handlePlayAudio = async () => {
    if (!activity.audio) {
      return;
    }

    const currentPlayer = audioPlayerRef.current;
    if (currentPlayer) {
      if (currentPlayer.paused) {
        try {
          await currentPlayer.play();
          setIsOriginalAudioOpen(true);
        } catch (error) {
          console.error("Failed to play saved dictation audio", error);
          setAudioError("Audio unavailable");
        }
      } else {
        currentPlayer.pause();
        setIsOriginalAudioOpen(false);
      }
      return;
    }

    setIsLoadingAudio(true);
    setAudioError(null);

    try {
      const savedAudio = await loadSavedDictationAudio(activity.audio.relativePath);
      const nextAudioUrl = URL.createObjectURL(
        new Blob([savedAudio.audioBytes], {
          type: savedAudio.mimeType,
        }),
      );
      const nextPlayer = new Audio(nextAudioUrl);
      nextPlayer.addEventListener("ended", () => {
        setIsOriginalAudioOpen(false);
      });
      setOriginalAudioUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return nextAudioUrl;
      });
      audioPlayerRef.current = nextPlayer;
      await nextPlayer.play();
      setIsOriginalAudioOpen(true);
    } catch (error) {
      console.error("Failed to load saved dictation audio", error);
      setAudioError("Audio unavailable");
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const handlePlayProcessedAudio = async () => {
    if (!processedAudio) {
      return;
    }

    const currentPlayer = processedAudioPlayerRef.current;
    if (currentPlayer) {
      if (currentPlayer.paused) {
        try {
          await currentPlayer.play();
          setIsProcessedAudioOpen(true);
        } catch (error) {
          console.error("Failed to play processed dictation audio", error);
          setAudioError("Processed audio unavailable");
        }
      } else {
        currentPlayer.pause();
        setIsProcessedAudioOpen(false);
      }
      return;
    }

    setIsLoadingProcessedAudio(true);
    setAudioError(null);

    try {
      const savedAudio = await loadSavedDictationAudio(processedAudio.relativePath);
      const nextAudioUrl = URL.createObjectURL(
        new Blob([savedAudio.audioBytes], {
          type: savedAudio.mimeType,
        }),
      );
      const nextPlayer = new Audio(nextAudioUrl);
      nextPlayer.addEventListener("ended", () => {
        setIsProcessedAudioOpen(false);
      });
      setProcessedAudioUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return nextAudioUrl;
      });
      processedAudioPlayerRef.current = nextPlayer;
      await nextPlayer.play();
      setIsProcessedAudioOpen(true);
    } catch (error) {
      console.error("Failed to load processed dictation audio", error);
      setAudioError("Processed audio unavailable");
    } finally {
      setIsLoadingProcessedAudio(false);
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

  return (
    <article
      className={cn(
        "group/activity relative flex flex-col gap-2 border-l-2 border-l-transparent border-b border-border/65 bg-card px-3.5 py-2 transition-colors last:border-b-0 hover:bg-muted/20 sm:px-4",
        activity.status === "failed" && "border-l-destructive/70 bg-destructive/[0.025]",
        activity.status === "skipped" && "border-l-warning/65 bg-warning/[0.012]",
        activity.isLatest && "bg-background/70",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/75 bg-muted/35 text-muted-foreground">
          {activity.iconMark ? (
            <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-foreground/75">
              {activity.iconMark}
            </span>
          ) : (
            <RowIcon className="size-4.5" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-col gap-1.5 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[0.98rem] font-semibold leading-tight text-foreground">
                {activity.appName}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs lg:justify-end">
              {activity.status === "inserted" ? null : (
                <StatusBadge
                  tone={statusMeta[activity.status].tone}
                  className="px-2.5 normal-case tracking-normal"
                >
                  <ActivityStatusIcon data-icon="inline-start" />
                  {statusMeta[activity.status].label}
                </StatusBadge>
              )}
              <span className="min-w-[4.75rem] text-right text-xs font-medium text-muted-foreground">
                {formatRelativeTime(activity.capturedAt)}
              </span>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
              <div className="min-w-0 overflow-hidden">
                <p
                  data-testid={`activity-transcript-${activity.recordId}`}
                  className={cn(
                    "max-w-full whitespace-pre-wrap break-words text-[0.92rem] leading-5 text-foreground/72 [overflow-wrap:anywhere]",
                    canExpandTranscript &&
                      !isTranscriptExpanded &&
                      "line-clamp-3",
                  )}
                >
                  {activity.transcriptPreview}
                </p>
                {canExpandTranscript ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="mt-1 h-6 rounded-full px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setIsTranscriptExpanded((current) => !current);
                    }}
                    aria-label={`${isTranscriptExpanded ? "Collapse" : "Expand"} transcript for ${activity.appName}`}
                  >
                    {isTranscriptExpanded ? (
                      <ChevronUpIcon data-icon="inline-start" />
                    ) : (
                      <ChevronDownIcon data-icon="inline-start" />
                    )}
                    {isTranscriptExpanded ? "Show less" : "Show more"}
                  </Button>
                ) : null}
                <div
                  data-testid={`activity-metadata-${activity.recordId}`}
                  className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5"
                >
                  <span className="min-w-0 truncate rounded-md border border-border/55 bg-muted/30 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {activity.providerLabel}
                  </span>
                  {activity.audio ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="h-6 rounded-md border border-transparent px-1.5 text-xs font-medium text-muted-foreground hover:border-border/70 hover:bg-muted/60 hover:text-foreground"
                      onClick={() => {
                        void handlePlayAudio();
                      }}
                      disabled={isLoadingAudio}
                      aria-label={`Play audio for ${activity.appName}`}
                    >
                      {isLoadingAudio ? (
                        <LoaderCircleIcon
                          className="animate-spin"
                          data-icon="inline-start"
                        />
                      ) : isOriginalAudioOpen ? (
                        <PauseIcon data-icon="inline-start" />
                      ) : (
                        <PlayIcon data-icon="inline-start" />
                      )}
                      {isOriginalAudioOpen ? "Pause" : "Play"}{" "}
                      {Math.max(1, Math.round(activity.audio.byteLength / 1024))} KB
                    </Button>
                  ) : null}
                  {processedAudio ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="h-6 rounded-md border border-transparent px-1.5 text-xs font-medium text-muted-foreground hover:border-border/70 hover:bg-muted/60 hover:text-foreground"
                      onClick={() => {
                        void handlePlayProcessedAudio();
                      }}
                      disabled={isLoadingProcessedAudio}
                      aria-label={`Play processed audio for ${activity.appName}`}
                    >
                      {isLoadingProcessedAudio ? (
                        <LoaderCircleIcon
                          className="animate-spin"
                          data-icon="inline-start"
                        />
                      ) : isProcessedAudioOpen ? (
                        <PauseIcon data-icon="inline-start" />
                      ) : (
                        <PlayIcon data-icon="inline-start" />
                      )}
                      Processed{" "}
                      {Math.max(1, Math.round(processedAudio.byteLength / 1024))} KB
                    </Button>
                  ) : null}
                  {canRetryTranscription ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      className="h-6 rounded-md border-destructive/30 bg-destructive/8 px-2 text-xs font-semibold text-destructive hover:bg-destructive/12 hover:text-destructive"
                      onClick={() => {
                        onRetryTranscription(activity);
                      }}
                      disabled={isRetrying}
                      aria-label={`Retry transcription for ${activity.appName}`}
                    >
                      {isRetrying ? (
                        <LoaderCircleIcon
                          className="animate-spin"
                          data-icon="inline-start"
                        />
                      ) : (
                        <RotateCcwIcon data-icon="inline-start" />
                      )}
                      {isRetrying ? "Retrying" : "Retry"}
                    </Button>
                  ) : null}
                </div>
                {audioError ? (
                  <div className="mt-1 text-xs text-destructive">{audioError}</div>
                ) : null}
                {retryError ? (
                  <div className="mt-1 text-xs text-destructive" role="alert">
                    Retry failed: {retryError}
                  </div>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="shrink-0 rounded-md px-2 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/activity:opacity-100"
                onClick={() => {
                  void handleCopyTranscript();
                }}
                aria-label={`Copy transcript for ${activity.appName}`}
                title={copyState === "copied" ? "Copied" : "Copy transcript"}
              >
                {copyState === "copied" ? (
                  <CheckIcon className="text-success" aria-hidden="true" />
                ) : (
                  <CopyIcon aria-hidden="true" />
                )}
                <span className="sr-only">
                  {copyState === "copied"
                    ? "Copied"
                    : copyState === "error"
                      ? "Retry copy"
                      : "Copy transcript"}
                </span>
              </Button>
            </div>
            {/*
              Timing metadata is intentionally hidden for now.
              Keep the formatter and mapped value in place until we decide how
              to surface processing diagnostics in the product later.
            */}
          </div>
        </div>
      </div>
    </article>
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

  const latestRecordsById = new Map(
    latestRecords.map((record) => [record.recordId, record]),
  );
  const currentRecordIds = new Set(currentRecords.map((record) => record.recordId));
  const newLatestRecords = latestRecords.filter(
    (record) => !currentRecordIds.has(record.recordId),
  );
  const updatedCurrentRecords = currentRecords.map(
    (record) => latestRecordsById.get(record.recordId) ?? record,
  );

  return [...newLatestRecords, ...updatedCurrentRecords];
}

function replaceRecord(
  currentRecords: DictationRecord[],
  updatedRecord: DictationRecord,
) {
  let replaced = false;
  const nextRecords = currentRecords.map((record) => {
    if (record.recordId !== updatedRecord.recordId) {
      return record;
    }

    replaced = true;
    return updatedRecord;
  });

  return replaced ? nextRecords : [updatedRecord, ...currentRecords];
}

function hasRecordSetChanged(
  currentRecords: DictationRecord[],
  nextRecords: DictationRecord[],
) {
  if (currentRecords.length !== nextRecords.length) {
    return true;
  }

  return nextRecords.some((nextRecord, index) => {
    const currentRecord = currentRecords[index];
    return (
      !currentRecord ||
      currentRecord.recordId !== nextRecord.recordId ||
      currentRecord.capturedAt !== nextRecord.capturedAt ||
      currentRecord.insertion.status !== nextRecord.insertion.status ||
      currentRecord.transcript.finalText !== nextRecord.transcript.finalText
    );
  });
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
    sourceRecord: record,
  };
}

function normalizeProviderId(providerId: string) {
  return providerId === "azure_openai" ? "azure-openai" : providerId;
}

function resolveRetryTranscriptionBlobs(input: {
  providerId: string;
  reprocessedAudio: Awaited<ReturnType<typeof analyzeAudioForRetry>> | null;
  fallbackAudioBlob: Blob;
}) {
  if (input.providerId === "assemblyai") {
    return [input.fallbackAudioBlob];
  }

  const segments = input.reprocessedAudio?.transcriptionSegments ?? [];
  return segments.length > 0 ? segments : [input.fallbackAudioBlob];
}

async function transcribeRetryAudio(input: {
  providerId: string;
  model?: string;
  reprocessedAudio: Awaited<ReturnType<typeof analyzeAudioForRetry>> | null;
  fallbackAudioBlob: Blob;
}) {
  const primaryBlobs = resolveRetryTranscriptionBlobs(input);
  const primary = await transcribeRetryBlobs({
    audioBlobs: primaryBlobs,
    model: input.model,
    providerId: input.providerId,
  });

  if (primary.text.length > 0 || input.providerId === "assemblyai") {
    return primary;
  }

  if (input.reprocessedAudio?.processedAudio) {
    const fullProcessed = await transcribeRetryBlobs({
      audioBlobs: [input.reprocessedAudio.processedAudio],
      model: input.model,
      providerId: input.providerId,
    });
    if (fullProcessed.text.length > 0) {
      return fullProcessed;
    }
  }

  if (primaryBlobs.length > 1) {
    return transcribeRetryBlobs({
      audioBlobs: [input.fallbackAudioBlob],
      model: input.model,
      providerId: input.providerId,
    });
  }

  return primary;
}

async function transcribeRetryBlobs(input: {
  providerId: string;
  model?: string;
  audioBlobs: Blob[];
}) {
  let providerId: string | null = null;
  let model: string | null = null;
  const texts: string[] = [];
  let lastEmptyResponseError: unknown = null;

  for (const audioBlob of input.audioBlobs) {
    try {
      const result = await transcribeRecording({
        providerId: input.providerId,
        audioBlob,
        language: "en",
        model: input.model,
      });
      providerId = providerId ?? result.providerId;
      model = model ?? result.model;
      const text = result.text.trim();
      if (text.length > 0) {
        texts.push(text);
      }
    } catch (error) {
      if (isEmptyProviderTranscriptError(error)) {
        lastEmptyResponseError = error;
        continue;
      }
      throw error;
    }
  }

  if (texts.length === 0 && input.audioBlobs.length === 1 && lastEmptyResponseError) {
    return {
      model,
      providerId,
      text: "",
    };
  }

  return {
    model,
    providerId,
    text: texts.join(" "),
  };
}

function isEmptyProviderTranscriptError(error: unknown) {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    (error as { code?: string }).code === "invalid_provider_response"
  );
}

async function persistRetryProcessedAudio(input: {
  audioBlob: Blob | null;
  capturedAt: string;
  fallback: DictationRecord["processedAudio"] | null | undefined;
}) {
  if (!input.audioBlob) {
    return input.fallback ?? null;
  }

  try {
    return await persistDictationAudio({
      audioBlob: input.audioBlob,
      capturedAt: input.capturedAt,
    });
  } catch (error) {
    console.error("Failed to persist retry processed audio", error);
    return input.fallback ?? null;
  }
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
  smallest: "Smallest AI",
  azure_openai: "Azure OpenAI",
  "azure-openai": "Azure OpenAI",
};

function formatRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  const elapsedSeconds = Math.max(
    0,
    Math.round((Date.now() - date.getTime()) / 1_000),
  );
  if (elapsedSeconds < 60) {
    return "Just now";
  }

  const elapsedMinutes = Math.round(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} min ago`;
  }

  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours} hr${elapsedHours === 1 ? "" : "s"} ago`;
  }

  const elapsedDays = Math.round(elapsedHours / 24);
  return `${elapsedDays} day${elapsedDays === 1 ? "" : "s"} ago`;
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
