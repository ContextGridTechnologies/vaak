import { useEffect, useMemo, useState } from "react";
import {
  ActivityIcon,
  CalendarDaysIcon,
  FileTextIcon,
  KeyboardIcon,
  Mic2Icon,
  SparklesIcon,
  TrendingUpIcon,
  type LucideIcon,
} from "lucide-react";

import { appScreenContentClassName } from "@/components/app";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
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
import {
  getRecentDictationRecords,
  isTauriRuntime,
  type DictationRecord,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";

const ANALYTICS_RECORD_LIMIT = 100;
const TREND_BUCKET_COUNT = 7;
const TYPING_WORDS_PER_MINUTE = 40;

type AnalyticsSummary = {
  activeDays: number;
  appRows: AppRow[];
  bestDay: TrendRow | null;
  dateRangeLabel: string;
  dictations: number;
  minutesSaved: number;
  timeSavedMs: number;
  todayTimeSavedMs: number;
  trendRows: TrendRow[];
  words: number;
};

type TrendRow = {
  key: string;
  label: string;
  dateLabel: string;
  minutesSaved: number;
};

type AppRow = {
  label: string;
  count: number;
  share: number;
};

export function AnalyticsPanel() {
  const [records, setRecords] = useState<DictationRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => buildAnalyticsSummary(records), [records]);

  async function loadAnalytics() {
    if (!isTauriRuntime()) {
      setRecords([]);
      setError("Analytics reads local activity only in the desktop runtime.");
      return;
    }

    setError(null);

    try {
      setRecords(await getRecentDictationRecords(ANALYTICS_RECORD_LIMIT, 0));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load local analytics.",
      );
    }
  }

  useEffect(() => {
    void loadAnalytics();
  }, []);

  return (
    <div className="min-h-full bg-background text-foreground">
      <main
        data-testid="analytics-screen-content"
        className={cn(appScreenContentClassName, "max-w-[86rem] gap-5")}
      >
        <section className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex flex-col gap-1">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              Analytics
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Local dictation productivity for the last seven days.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="h-9 gap-2 px-3 font-normal">
              <CalendarDaysIcon aria-hidden="true" />
              {summary.dateRangeLabel}
            </Badge>
          </div>
        </section>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Analytics unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <TimeSavedHero summary={summary} />

        <section className="grid gap-3 md:grid-cols-3">
          <MetricCard
            icon={FileTextIcon}
            label="Words dictated"
            value={formatNumber(summary.words)}
            detail={
              summary.words > 0
                ? "From successful dictations"
                : "Start dictating to build this"
            }
          />
          <MetricCard
            icon={Mic2Icon}
            label="Dictations"
            value={formatNumber(summary.dictations)}
            detail="Inserted or recovered locally"
          />
          <MetricCard
            icon={CalendarDaysIcon}
            label="Active days"
            value={`${summary.activeDays} of ${TREND_BUCKET_COUNT}`}
            detail="Days with successful dictation"
          />
        </section>

        {records.length === 0 && !error ? <AnalyticsEmptyState /> : null}

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] 2xl:grid-cols-[minmax(0,1fr)_28rem]">
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <CardTitle>Productivity this week</CardTitle>
                <CardDescription>
                  Minutes saved by dictating instead of typing.
                </CardDescription>
              </div>
              <CardAction>
                <Badge variant="secondary" className="gap-1.5 text-xs">
                  <TrendingUpIcon aria-hidden="true" />
                  {summary.bestDay
                    ? `${summary.bestDay.label} was best`
                    : "No activity"}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <ProductivityChart rows={summary.trendRows} />
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader className="gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <CardTitle>Most used apps</CardTitle>
                <CardDescription>Where dictation helped most.</CardDescription>
              </div>
              <CardAction className="text-right">
                <div className="text-xl font-semibold tracking-tight">
                  {formatSavedTime(summary.timeSavedMs)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDictationCount(summary.dictations)}
                </div>
              </CardAction>
            </CardHeader>
            <CardContent>
              <MostUsedApps rows={summary.appRows} />
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}

function TimeSavedHero({ summary }: { summary: AnalyticsSummary }) {
  return (
    <section className="overflow-hidden rounded-xl bg-card text-card-foreground shadow-sm ring-1 ring-foreground/10">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="flex flex-col justify-between gap-5 bg-primary p-5 text-primary-foreground sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-medium opacity-90">Time saved</div>
              <div className="mt-3 font-heading text-5xl font-semibold leading-none tracking-tight sm:text-6xl">
                {formatSavedTime(summary.timeSavedMs)}
              </div>
            </div>
            <SparklesIcon aria-hidden="true" className="mt-1 shrink-0 opacity-90" />
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-primary-foreground/12 p-3">
              <div className="font-medium">
                {formatSavedTime(summary.todayTimeSavedMs)}
              </div>
              <div className="mt-1 opacity-85">Saved today</div>
            </div>
            <div className="rounded-lg bg-primary-foreground/12 p-3">
              <div className="font-medium">
                {summary.bestDay ? summary.bestDay.label : "No best day"}
              </div>
              <div className="mt-1 opacity-85">Top day</div>
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm font-medium">Seven-day trend</div>
              <div className="text-sm text-muted-foreground">
                {formatNumber(summary.minutesSaved)} minutes saved this week
              </div>
            </div>
            <Badge variant="outline" className="mt-1 w-fit gap-1.5">
              <ActivityIcon aria-hidden="true" />
              {summary.activeDays} active days
            </Badge>
          </div>
          <MiniTrendLine rows={summary.trendRows} />
        </div>
      </div>
    </section>
  );
}

type MetricCardProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
};

function MetricCard({ icon: Icon, label, value, detail }: MetricCardProps) {
  return (
    <Card size="sm" className="border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span className="truncate">{label}</span>
          <Icon aria-hidden="true" className="shrink-0" />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-16 flex-col justify-end">
        <div className="text-3xl font-semibold leading-none tracking-tight">{value}</div>
        <div className="mt-3 truncate text-xs text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  );
}

function AnalyticsEmptyState() {
  return (
    <Empty className="border border-border/70 bg-muted/20">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <KeyboardIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>No dictation activity yet</EmptyTitle>
        <EmptyDescription>
          Your time saved, words, and app usage will appear here after local
          dictation records are saved.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function ProductivityChart({ rows }: { rows: TrendRow[] }) {
  const maxValue = Math.max(1, ...rows.map((row) => row.minutesSaved));
  const topTick = getNiceChartMax(maxValue);
  const ticks = [
    topTick,
    Math.round(topTick * 0.75),
    Math.round(topTick * 0.5),
    Math.round(topTick * 0.25),
    0,
  ];

  return (
    <div
      aria-label="Productivity this week"
      role="img"
      className="grid min-h-72 grid-cols-[2rem_minmax(0,1fr)] gap-3"
    >
      <div className="flex flex-col justify-between py-3 text-xs text-muted-foreground">
        {ticks.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
      <div className="grid min-w-0 grid-cols-7 items-end gap-2 border-b border-border/80 bg-[linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[length:100%_25%] px-2 pt-3 pb-4 sm:gap-3 sm:px-4">
        {rows.map((row) => (
          <div key={row.key} className="flex min-w-0 flex-col items-center gap-2">
            <div className="h-4 text-xs font-medium tabular-nums">
              {row.minutesSaved > 0 ? row.minutesSaved : ""}
            </div>
            <div
              className={cn(
                "w-full max-w-10 rounded-t-md shadow-sm",
                row.minutesSaved > 0 ? "bg-chart-1" : "bg-muted",
              )}
              style={{
                height:
                  row.minutesSaved > 0
                    ? `${Math.max(0.12, row.minutesSaved / topTick) * 11}rem`
                    : "0.375rem",
              }}
            />
            <div className="min-w-0 text-center text-[0.7rem] leading-4 text-muted-foreground sm:text-xs">
              <div>{row.label}</div>
              <div>{row.dateLabel}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MostUsedApps({ rows }: { rows: AppRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        App usage appears after successful dictations.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.map((row, index) => (
        <div
          key={row.label}
          className="grid grid-cols-[minmax(0,1fr)_3.5rem] gap-2 rounded-lg border border-border/70 bg-muted/20 p-3"
        >
          <div className="min-w-0 flex flex-col gap-2">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{row.label}</div>
                <div className="text-xs text-muted-foreground">
                  #{index + 1} · {formatDictationCount(row.count)}
                </div>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-background">
              <div
                className="h-full rounded-full bg-chart-1"
                style={{ width: `${Math.max(4, row.share * 100)}%` }}
              />
            </div>
          </div>
          <div className="self-start text-right text-sm font-medium tabular-nums">
            {formatPercent(row.share)}
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniTrendLine({ rows }: { rows: TrendRow[] }) {
  const width = 520;
  const height = 92;
  const padding = 10;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const maxValue = Math.max(1, ...rows.map((row) => row.minutesSaved));
  const points = rows.map((row, index) => {
    const x = padding + (chartWidth / Math.max(rows.length - 1, 1)) * index;
    const y = padding + chartHeight - (row.minutesSaved / maxValue) * chartHeight;

    return { x, y, row };
  });
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  return (
    <svg
      aria-hidden="true"
      className="h-24 w-full overflow-visible"
      viewBox={`0 0 ${width} ${height}`}
    >
      <path
        d={`${path} L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`}
        className="fill-chart-1"
        opacity="0.1"
      />
      <path
        d={path}
        fill="none"
        className="stroke-chart-1"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      {points.map((point) => (
        <circle
          key={point.row.key}
          cx={point.x}
          cy={point.y}
          className="fill-card stroke-card"
          r="3"
          strokeWidth="2"
        />
      ))}
    </svg>
  );
}

function buildAnalyticsSummary(records: DictationRecord[]): AnalyticsSummary {
  const trendRows = buildTrendRows(records);
  const trendKeys = new Set(trendRows.map((row) => row.key));
  const successfulRecords = records.filter((record) => {
    if (!isSuccessful(record)) {
      return false;
    }

    const capturedAt = parseRecordDate(record);

    return capturedAt ? trendKeys.has(formatDateKey(capturedAt)) : false;
  });
  const todayKey = formatDateKey(new Date());
  const appCounts = new Map<string, number>();
  const activeDayKeys = new Set<string>();
  let words = 0;
  let timeSavedMs = 0;
  let todayTimeSavedMs = 0;

  for (const record of successfulRecords) {
    const wordCount = getWordCount(record);
    const savedMs = getSavedTimeMs(record, wordCount);
    const capturedAt = parseRecordDate(record);
    const capturedKey = capturedAt ? formatDateKey(capturedAt) : null;

    words += wordCount;
    timeSavedMs += savedMs;
    if (capturedKey === todayKey) {
      todayTimeSavedMs += savedMs;
    }
    if (capturedKey) {
      activeDayKeys.add(capturedKey);
    }

    const appLabel = formatAppLabel(record.target.windowTitle);
    appCounts.set(appLabel, (appCounts.get(appLabel) ?? 0) + 1);
  }

  return {
    activeDays: activeDayKeys.size,
    appRows: [...appCounts.entries()]
      .map(([label, count]) => ({
        label,
        count,
        share: successfulRecords.length > 0 ? count / successfulRecords.length : 0,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 5),
    bestDay: findBestTrendDay(trendRows),
    dateRangeLabel: buildDateRangeLabel(trendRows),
    dictations: successfulRecords.length,
    minutesSaved: Math.round(timeSavedMs / 60_000),
    timeSavedMs,
    todayTimeSavedMs,
    trendRows,
    words,
  };
}

function findBestTrendDay(rows: TrendRow[]): TrendRow | null {
  const best = rows.reduce<TrendRow | null>((currentBest, row) => {
    if (!currentBest || row.minutesSaved > currentBest.minutesSaved) {
      return row;
    }

    return currentBest;
  }, null);

  return best && best.minutesSaved > 0 ? best : null;
}

function buildTrendRows(records: DictationRecord[]): TrendRow[] {
  const latestTimestamp = Math.max(
    Date.now(),
    ...records
      .map((record) => Date.parse(record.capturedAt))
      .filter((timestamp) => Number.isFinite(timestamp)),
  );
  const latestDate = startOfLocalDay(new Date(latestTimestamp));
  const buckets = Array.from({ length: TREND_BUCKET_COUNT }, (_, index) => {
    const date = new Date(latestDate);
    date.setDate(latestDate.getDate() - (TREND_BUCKET_COUNT - 1 - index));

    return {
      date,
      key: formatDateKey(date),
      savedMs: 0,
    };
  });
  const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  for (const record of records) {
    if (!isSuccessful(record)) {
      continue;
    }

    const capturedAt = parseRecordDate(record);
    if (!capturedAt) {
      continue;
    }

    const bucket = bucketMap.get(formatDateKey(capturedAt));
    if (!bucket) {
      continue;
    }

    bucket.savedMs += getSavedTimeMs(record, getWordCount(record));
  }

  return buckets.map((bucket) => ({
    key: bucket.key,
    label: formatWeekday(bucket.date),
    dateLabel: formatShortDate(bucket.date),
    minutesSaved: Math.round(bucket.savedMs / 60_000),
  }));
}

function getWordCount(record: DictationRecord): number {
  const text = record.transcript.finalText || record.transcript.rawText;
  const words = text.trim().match(/\S+/g);

  if (words) {
    return words.length;
  }

  return Math.ceil(record.transcript.characterCount / 5);
}

function getSavedTimeMs(record: DictationRecord, words: number): number {
  const estimatedTypingMs = (words / TYPING_WORDS_PER_MINUTE) * 60_000;
  const dictationMs = getEndToEndMs(record) ?? 0;

  return Math.max(0, Math.round(estimatedTypingMs - dictationMs));
}

function getEndToEndMs(record: DictationRecord): number | null {
  const started = Date.parse(record.startedAt ?? "");
  const ended = Date.parse(record.endedAt ?? "");

  if (Number.isFinite(started) && Number.isFinite(ended) && ended >= started) {
    return ended - started;
  }

  return null;
}

function isSuccessful(record: DictationRecord): boolean {
  return (
    record.insertion.status === "inserted" ||
    record.insertion.status === "recovered"
  );
}

function parseRecordDate(record: DictationRecord): Date | null {
  const timestamp = Date.parse(record.capturedAt);

  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function formatAppLabel(windowTitle: string | null | undefined): string {
  const normalizedTitle = windowTitle
    ?.replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalizedTitle) {
    return "Other";
  }

  if (/visual studio code|vs code|code/i.test(normalizedTitle)) {
    return "VS Code";
  }
  if (/chrome/i.test(normalizedTitle)) {
    return "Chrome";
  }
  if (/notepad/i.test(normalizedTitle)) {
    return "Notepad";
  }
  if (/\bvaak$/i.test(normalizedTitle)) {
    return "Vaak";
  }

  return normalizedTitle;
}

function buildDateRangeLabel(rows: TrendRow[]): string {
  const first = rows[0];
  const last = rows[rows.length - 1];

  if (!first || !last) {
    return "Last 7 days";
  }

  return `${first.dateLabel} - ${last.dateLabel}`;
}

function formatSavedTime(value: number): string {
  const minutes = Math.round(value / 60_000);

  if (minutes >= 1) {
    return `${formatNumber(minutes)} min`;
  }

  return `${Math.round(value / 1000)} sec`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDictationCount(value: number): string {
  return `${formatNumber(value)} ${value === 1 ? "dictation" : "dictations"}`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function getNiceChartMax(value: number): number {
  if (value <= 5) {
    return 5;
  }
  if (value <= 10) {
    return 10;
  }
  if (value <= 20) {
    return 20;
  }

  return Math.ceil(value / 10) * 10;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatWeekday(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
  }).format(date);
}
