import { useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { SpeechProviderSettings } from "@/features/settings/speech-provider";

import {
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
          totalSteps={5}
          title="Connect a speech provider"
          description="Vaak sends audio only to the provider you choose."
        />
      }
      footerHint="Provider keys stay on this device."
      contentClassName="max-w-[48rem]"
    >
      <Card
        data-testid="provider-setup-card"
        className="mx-auto w-full rounded-lg border border-border/80 bg-card py-0 shadow-sm"
      >
        <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
          <SpeechProviderSettings
            variant="onboarding"
            onOnboardingVerifiedChange={setProviderVerified}
          />

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>

        <CardFooter
          data-testid="provider-setup-card-footer"
          className="justify-between gap-3 rounded-b-lg border-t border-border/70 bg-muted/35 p-4 sm:px-5"
        >
          <div>
            <Button type="button" size="sm" variant="outline" onClick={onBack}>
              <ArrowLeftIcon data-icon="inline-start" />
              Back
            </Button>
          </div>

          {providerVerified ? (
            <Button type="button" size="sm" onClick={onContinue}>
              Next
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          ) : null}
        </CardFooter>
      </Card>
    </OnboardingShell>
  );
}
