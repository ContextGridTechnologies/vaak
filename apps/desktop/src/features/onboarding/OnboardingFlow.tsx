import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRightIcon,
  Building2Icon,
  CloudOffIcon,
  KeyRoundIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  UserRoundIcon,
} from "lucide-react";

import {
  AppScreen,
  StatusBadge,
  appScreenContentClassName,
} from "@/components/app";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getOnboardingState,
  isTauriRuntime,
  saveOnboardingMode,
  type OnboardingMode,
  type OnboardingState,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";

type OnboardingGateProps = {
  children: ReactNode;
};

export function OnboardingGate({ children }: OnboardingGateProps) {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(() => isTauriRuntime());
  const [error, setError] = useState<string | null>(null);
  const [savingMode, setSavingMode] = useState<OnboardingMode | null>(null);

  useEffect(() => {
    if (!isTauriRuntime()) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    getOnboardingState()
      .then((loadedState) => {
        if (active) {
          setState(loadedState);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Unable to load setup state.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleModeSelect(mode: OnboardingMode) {
    setSavingMode(mode);
    setError(null);

    try {
      const savedState = await saveOnboardingMode(mode);
      setState(savedState);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save setup mode.");
    } finally {
      setSavingMode(null);
    }
  }

  if (!isTauriRuntime()) {
    return children;
  }

  if (loading) {
    return <OnboardingLoadingScreen />;
  }

  if (state && (state.completed || state.currentStep !== "modeChoice")) {
    return children;
  }

  return (
    <OnboardingModeChoice
      error={error}
      savingMode={savingMode}
      onSelectMode={handleModeSelect}
    />
  );
}

type OnboardingModeChoiceProps = {
  error: string | null;
  savingMode: OnboardingMode | null;
  onSelectMode: (mode: OnboardingMode) => void;
};

function OnboardingModeChoice({
  error,
  savingMode,
  onSelectMode,
}: OnboardingModeChoiceProps) {
  return (
    <AppScreen
      eyebrow="Vaak setup"
      title="Choose how Vaak starts"
      description="Set up the desktop voice layer without making cloud auth a blocker."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone="success">Local-first</StatusBadge>
          <StatusBadge tone="neutral">Account optional</StatusBadge>
        </div>
      }
    >
      <section className="grid gap-4 lg:grid-cols-3">
        <ModeCard
          icon={CloudOffIcon}
          title="Local setup"
          badge="Available now"
          description="Use Vaak on this desktop with your own speech provider key."
          points={["No Vaak account required", "Provider keys stay in secure storage"]}
          actionLabel="Continue locally"
          disabled={Boolean(savingMode)}
          loading={savingMode === "local"}
          onClick={() => onSelectMode("local")}
        />
        <ModeCard
          icon={UserRoundIcon}
          title="Sign in for sync"
          badge="Coming later"
          description="Keep local dictation while syncing preferences across your devices."
          points={["Optional account path", "Local providers still supported"]}
          actionLabel="Not available yet"
          disabled
          onClick={() => onSelectMode("sync")}
        />
        <ModeCard
          icon={Building2Icon}
          title="Managed Vaak"
          badge="Coming later"
          description="Use hosted transcription, billing, and team controls when those services ship."
          points={["Subscription-ready path", "No setup dependency today"]}
          actionLabel="Not available yet"
          disabled
          onClick={() => onSelectMode("managed")}
        />
      </section>
      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
    </AppScreen>
  );
}

type ModeCardProps = {
  icon: typeof CloudOffIcon;
  title: string;
  badge: string;
  description: string;
  points: string[];
  actionLabel: string;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
};

function ModeCard({
  icon: Icon,
  title,
  badge,
  description,
  points,
  actionLabel,
  disabled = false,
  loading = false,
  onClick,
}: ModeCardProps) {
  return (
    <Card className="rounded-lg shadow-none">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted">
              <Icon className="size-4 text-primary" aria-hidden={true} />
            </div>
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          <Badge variant={badge === "Available now" ? "default" : "secondary"}>
            {badge}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{description}</p>
        <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
          {points.map((point) => (
            <li key={point} className="flex items-center gap-2">
              <ShieldCheckIcon className="size-4 shrink-0 text-primary" aria-hidden={true} />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          variant={disabled ? "outline" : "default"}
          disabled={disabled}
          onClick={onClick}
        >
          {loading ? (
            <RefreshCwIcon className="animate-spin" data-icon="inline-start" />
          ) : (
            <KeyRoundIcon
              className={cn(disabled && "hidden")}
              data-icon="inline-start"
            />
          )}
          {actionLabel}
          {!disabled && !loading ? <ArrowRightIcon data-icon="inline-end" /> : null}
        </Button>
      </CardFooter>
    </Card>
  );
}

function OnboardingLoadingScreen() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main
        data-testid="app-screen-content"
        className={appScreenContentClassName}
      >
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      </main>
    </div>
  );
}
