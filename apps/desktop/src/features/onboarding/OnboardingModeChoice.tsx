import { useState } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { ChoiceCard } from "@/components/app";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { analytics } from "@/lib/analytics/browser";
import type { OnboardingMode } from "@/lib/tauri";

import { OnboardingProgressHeader } from "./components/OnboardingProgressHeader";
import { OnboardingShell } from "./components/OnboardingShell";
import { onboardingModeCards } from "./onboardingContent";

type OnboardingModeChoiceProps = {
  error: string | null;
  savingMode: OnboardingMode | null;
  onSelectMode: (mode: OnboardingMode) => void;
};

export function OnboardingModeChoice({
  error,
  savingMode,
  onSelectMode,
}: OnboardingModeChoiceProps) {
  const [telemetryEnabled, setTelemetryEnabled] = useState(
    () =>
      analytics.usageAnalyticsEnabled || analytics.errorTelemetryEnabled,
  );

  function handleTelemetryChange(enabled: boolean) {
    analytics.setUsageAnalyticsEnabled(enabled);
    analytics.setErrorTelemetryEnabled(enabled);
    if (enabled) {
      analytics.captureAppOpened();
    }
    setTelemetryEnabled(enabled);
  }

  return (
    <OnboardingShell
      header={
        <OnboardingProgressHeader
          step={1}
          totalSteps={4}
          title="Choose how to use Vaak"
          description="Set up desktop dictation without changing how you work."
        />
      }
      footerHint="You can change this later in Settings."
    >
        <section className="mx-auto grid w-full max-w-[56rem] justify-center grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),23.75rem))] gap-5 lg:gap-6">
          {onboardingModeCards.map((mode) => (
            <ChoiceCard
              key={mode.id}
              icon={mode.icon}
              title={mode.title}
              badge={mode.badge}
              description={mode.description}
              points={mode.points}
              actionLabel={mode.actionLabel}
              selected={mode.selected}
              future={mode.future}
              disabled={mode.id === "local" ? Boolean(savingMode) : true}
              loading={savingMode === mode.id}
              onClick={
                mode.id === "local" ? () => onSelectMode("local") : undefined
              }
            />
          ))}
        </section>

        <div className="mx-auto flex w-full max-w-[47.5rem] items-start justify-between gap-4 rounded-lg border border-border/70 bg-card/70 p-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              Help improve Vaak
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              Share anonymous setup, reliability, and error diagnostics. Vaak
              never sends audio, transcripts, provider keys, or file paths.
            </p>
          </div>
          <Switch
            aria-label="Share anonymous analytics and diagnostics"
            checked={telemetryEnabled}
            onCheckedChange={handleTelemetryChange}
          />
        </div>

        {error ? (
          <Alert variant="destructive">
            <TriangleAlertIcon aria-hidden={true} />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
    </OnboardingShell>
  );
}
