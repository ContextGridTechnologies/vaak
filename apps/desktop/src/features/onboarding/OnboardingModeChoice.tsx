import { TriangleAlertIcon } from "lucide-react";

import { ChoiceCard } from "@/components/app";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  return (
    <OnboardingShell
      header={
        <OnboardingProgressHeader
          step={1}
          totalSteps={5}
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

        {error ? (
          <Alert variant="destructive">
            <TriangleAlertIcon aria-hidden={true} />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
    </OnboardingShell>
  );
}
