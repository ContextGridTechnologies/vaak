import { useState } from "react";

import { Button } from "@/components/ui/button";
import { SpeechProviderSettings } from "@/features/settings/speech-provider";

import {
  OnboardingActionBar,
  OnboardingProgressHeader,
  OnboardingShell,
} from "./components";

type ProviderSetupStepProps = {
  error: string | null;
  onBack: () => void;
  onContinue: () => void;
};

export function ProviderSetupStep({
  error,
  onBack,
  onContinue,
}: ProviderSetupStepProps) {
  const [providerVerified, setProviderVerified] = useState(false);

  return (
    <OnboardingShell
      header={
        <OnboardingProgressHeader
          step={3}
          totalSteps={4}
          title="Connect a speech provider"
          description="Vaak sends audio only to the provider you choose."
        />
      }
      footerHint="Provider keys stay on this device."
      contentClassName="max-w-[48rem]"
    >
      <div className="flex flex-col gap-4">
        <SpeechProviderSettings
          variant="onboarding"
          onOnboardingVerifiedChange={setProviderVerified}
        />

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <OnboardingActionBar
          align="between"
          primaryAction={
            <Button type="button" size="sm" variant="outline" onClick={onBack}>
              Back
            </Button>
          }
          secondaryAction={
            providerVerified ? (
              <Button type="button" size="sm" onClick={onContinue}>
                Next
              </Button>
            ) : null
          }
        />
      </div>
    </OnboardingShell>
  );
}
