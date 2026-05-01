import { InfoIcon, TriangleAlertIcon } from "lucide-react";

import { ChoiceCard } from "@/components/app";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { OnboardingMode } from "@/lib/tauri";

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
  return (
    <div className="min-h-full bg-background text-foreground">
      <main
        data-testid="app-screen-content"
        className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-[64rem] flex-col justify-center gap-6 px-4 py-10 sm:px-6 lg:py-14"
      >
        <OnboardingSetupHeader />

        <section className="grid gap-3 md:grid-cols-3">
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

        <OnboardingSettingsHint />

        {error ? (
          <Alert variant="destructive">
            <TriangleAlertIcon aria-hidden={true} />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </main>
    </div>
  );
}

function OnboardingSetupHeader() {
  return (
    <header className="mx-auto flex max-w-xl flex-col items-center gap-2.5 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
        VAAK SETUP
      </p>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
          Choose how to use Vaak
        </h1>
        <p className="text-sm text-muted-foreground sm:text-[0.95rem]">
          Set up desktop dictation without changing how you work.
        </p>
      </div>
    </header>
  );
}

function OnboardingSettingsHint() {
  return (
    <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <InfoIcon className="size-4 shrink-0" aria-hidden={true} />
      <span>You can change this later in Settings.</span>
    </p>
  );
}
