import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightIcon,
  CircleAlertIcon,
  CircleCheckBigIcon,
  CircleSlash2Icon,
  Clock3Icon,
  LoaderCircleIcon,
  type LucideIcon,
  MessageSquareTextIcon,
  NotebookPenIcon,
  PlayIcon,
  SquareTerminalIcon,
  StickyNoteIcon,
  TargetIcon,
} from "lucide-react";

import { AppScreen, StatusBadge } from "@/components/app";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { AudioPlayback } from "@/features/dictation/components/AudioPlayback";
import {
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
  status: ActivityStatus;
  targetName: string;
  inputKindLabel: string;
  transcriptPreview: string;
  providerLabel: string;
  capturedAt: string;
  isLatest: boolean;
  audio: DictationRecord["audio"] | null | undefined;
  processingSummary: string | null;
};

const POLL_INTERVAL_MS = 3_000;
const DEFAULT_LIMIT = 12;

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

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let disposed = false;

    const loadRecords = async () => {
      try {
        const recent = await getRecentDictationRecords(DEFAULT_LIMIT);
        if (disposed) {
          return;
        }

        setRecords(recent);
      } catch (error) {
        if (!disposed) {
          console.error("Failed to load dictation records", error);
          setRecords([]);
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

  const recordCountLabel = useMemo(() => {
    const count = activities.length;
    return `Local history · ${count} recent record${count === 1 ? "" : "s"}`;
  }, [activities.length]);

  const activityOverview = useMemo(
    () => buildActivityOverview(activities),
    [activities],
  );

  return (
    <AppScreen
      eyebrow="Voice"
      title="Recent dictation activity"
      description={recordCountLabel}
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled
          title="Full-history navigation is not available yet."
        >
          View full history
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      }
      contentClassName="max-w-[74rem] gap-5"
    >
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardHeader className="gap-3 border-b border-border/70">
            <div className="flex flex-col gap-1">
              <CardTitle>Activity feed</CardTitle>
              <CardDescription>
                Local-first capture history from your latest dictation sessions.
              </CardDescription>
            </div>
            <CardAction className="flex flex-wrap items-center justify-end gap-2">
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
            </CardAction>
          </CardHeader>

          <CardContent className="p-0">
            {activities.length > 0 ? (
              <div className="flex flex-col">
                {activities.map((activity, index) => (
                  <div key={activity.recordId}>
                    {index > 0 ? <Separator /> : null}
                    <ActivityFeedItem activity={activity} />
                  </div>
                ))}
              </div>
            ) : (
              <Empty className="min-h-[24rem] rounded-none border-0">
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
            )}
          </CardContent>

          <CardFooter className="justify-between gap-3 text-sm text-muted-foreground">
            <span>Showing the latest {DEFAULT_LIMIT} captures on this device</span>
            <span>
              {activities[0]
                ? `Latest ${formatRelativeTime(activities[0].capturedAt)}`
                : "Waiting for the first capture"}
            </span>
          </CardFooter>
        </Card>

        <Card
          size="sm"
          className="border-border/70 bg-gradient-to-br from-card via-card to-primary/5 shadow-sm"
        >
          <CardHeader className="border-b border-border/70">
            <CardTitle>Activity overview</CardTitle>
            <CardDescription>
              Quick health signals for recent dictation across desktop
              surfaces.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <OverviewMetric
              icon={Clock3Icon}
              label="Recent records"
              value={String(activityOverview.totalRecords)}
              description={`Polling local history every ${POLL_INTERVAL_MS / 1_000} seconds`}
            />
            <OverviewMetric
              icon={CircleCheckBigIcon}
              label="Successful inserts"
              value={`${activityOverview.successRate}%`}
              description={`${activityOverview.insertedCount} of ${activityOverview.totalRecords} recent records`}
              tone="success"
            />
            <OverviewMetric
              icon={TargetIcon}
              label="Primary target"
              value={activityOverview.primaryTarget}
              description={activityOverview.primaryTargetDescription}
            />
          </CardContent>
        </Card>
      </section>
    </AppScreen>
  );
}

type ActivityFeedItemProps = {
  activity: HomeActivity;
};

function ActivityFeedItem({ activity }: ActivityFeedItemProps) {
  const RowIcon = activity.icon;
  const ActivityStatusIcon = statusMeta[activity.status].icon;
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isAudioOpen, setIsAudioOpen] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const handlePlayAudio = async () => {
    if (!activity.audio) {
      return;
    }

    if (audioUrl) {
      setIsAudioOpen((current) => !current);
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
      setAudioUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return nextAudioUrl;
      });
      setIsAudioOpen(true);
    } catch (error) {
      console.error("Failed to load saved dictation audio", error);
      setAudioError("Audio unavailable");
    } finally {
      setIsLoadingAudio(false);
    }
  };

  return (
    <article
      className={cn(
        "flex flex-col gap-4 px-4 py-4 transition-colors sm:px-5",
        activity.isLatest ? "bg-primary/5" : "hover:bg-muted/35",
      )}
    >
      <div className="flex items-start gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background text-muted-foreground shadow-xs">
          <RowIcon className="size-5" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold text-foreground">
                {activity.appName}
              </div>
              <div className="text-sm text-muted-foreground">
                {activity.targetName}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <StatusBadge
                tone={statusMeta[activity.status].tone}
                className="normal-case tracking-normal"
              >
                <ActivityStatusIcon data-icon="inline-start" />
                {statusMeta[activity.status].label}
              </StatusBadge>
              <Badge variant="outline" className="h-6 rounded-md px-2.5">
                {activity.inputKindLabel}
              </Badge>
              <Badge variant="secondary" className="h-6 rounded-md px-2.5">
                {activity.providerLabel}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {formatRelativeTime(activity.capturedAt)}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-background/80 px-3.5 py-3 shadow-xs">
            <p className="text-sm leading-6 text-foreground/92">
              {activity.transcriptPreview}
            </p>
            {activity.processingSummary ? (
              <div className="mt-2 text-xs text-muted-foreground">
                {activity.processingSummary}
              </div>
            ) : null}
          </div>

          {activity.audio ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void handlePlayAudio();
                  }}
                  disabled={isLoadingAudio}
                  aria-label={`Play audio for ${activity.appName}`}
                >
                  {isLoadingAudio ? (
                    <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <PlayIcon data-icon="inline-start" />
                  )}
                  {audioUrl && isAudioOpen ? "Hide audio" : "Play audio"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {Math.max(1, Math.round(activity.audio.byteLength / 1024))} KB
                </span>
              </div>
              {audioError ? (
                <div className="text-xs text-destructive">{audioError}</div>
              ) : null}
              {isAudioOpen ? <AudioPlayback audioUrl={audioUrl} /> : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

type OverviewMetricProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  description: string;
  tone?: "default" | "success";
};

function OverviewMetric({
  icon: Icon,
  label,
  value,
  description,
  tone = "default",
}: OverviewMetricProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-background/80 p-3 shadow-xs">
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/60 text-muted-foreground",
          tone === "success" && "border-success/20 bg-success/10 text-success",
        )}
      >
        <Icon className="size-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 text-lg font-semibold text-foreground">
          {value}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">{description}</div>
      </div>
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
  const totalRecords = activities.length;
  const successRate =
    totalRecords > 0 ? Math.round((insertedCount / totalRecords) * 100) : 0;
  const primaryTargetActivity = activities[0];

  return {
    insertedCount,
    skippedCount,
    failedCount,
    totalRecords,
    successRate,
    primaryTarget: primaryTargetActivity
      ? primaryTargetActivity.appName
      : "Waiting for first capture",
    primaryTargetDescription: primaryTargetActivity
      ? `${primaryTargetActivity.targetName} · ${primaryTargetActivity.inputKindLabel}`
      : "No capture target detected yet",
  };
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
    processingSummary: formatProcessingSummary(record),
  };
}

function deriveAppName(record: DictationRecord) {
  const title = record.target.windowTitle.trim();
  if (title.includes("Discord")) {
    return "Discord";
  }
  if (title.includes("Visual Studio Code") || title.includes("VS Code")) {
    return "Visual Studio Code";
  }
  if (title.includes("Notepad")) {
    return "Notepad";
  }
  if (title.includes("Terminal") || title.includes("PowerShell")) {
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

function formatInputKind(inputKind: string) {
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
  const processingMs = record.recording?.postProcessingMs;
  const transcriptionMs = record.recording?.transcriptionMs;
  const insertionMs = record.recording?.insertionMs;

  const parts = [
    typeof processingMs === "number"
      ? `Processing ${formatDurationMs(processingMs)}`
      : null,
    typeof transcriptionMs === "number"
      ? `STT ${formatDurationMs(transcriptionMs)}`
      : null,
    typeof insertionMs === "number"
      ? `Insert ${formatDurationMs(insertionMs)}`
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
