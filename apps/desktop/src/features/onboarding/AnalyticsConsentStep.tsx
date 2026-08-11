import { ArrowLeftIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import {
  OnboardingActionBar,
  OnboardingProgressHeader,
  OnboardingShell,
} from "./components";

type AnalyticsConsentStepProps = {
  error: string | null;
  onBack: () => void;
  onChoice: (enabled: boolean) => void;
};

export function AnalyticsConsentStep({
  error,
  onBack,
  onChoice,
}: AnalyticsConsentStepProps) {
  return (
    <OnboardingShell
      header={
        <OnboardingProgressHeader
          step={5}
          totalSteps={5}
          title="Optional usage analytics"
          description="Choose whether to share anonymous product-usage events."
        />
      }
      contentClassName="max-w-[44rem]"
    >
      <Card
        data-testid="analytics-consent-card"
        className="mx-auto w-full max-w-xl rounded-lg shadow-none"
      >
        <CardHeader className="gap-2 p-5 sm:p-6">
          <CardTitle>
            Allow Vaak to send anonymous product-usage events when you use the
            app?
          </CardTitle>
          <CardDescription>
            This helps us understand feature usage and reliability.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4 px-5 sm:px-6">
          <p className="text-sm text-muted-foreground">
            You can change this later in Settings.
          </p>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>

        <CardFooter className="border-t-0 bg-transparent p-5 pt-1 sm:px-6 sm:pt-2">
          <OnboardingActionBar
            align="between"
            className="w-full"
            primaryAction={
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onBack}
              >
                <ArrowLeftIcon data-icon="inline-start" />
                Back
              </Button>
            }
            secondaryAction={
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onChoice(false)}
                >
                  Not now
                </Button>
                <Button type="button" size="sm" onClick={() => onChoice(true)}>
                  Enable analytics
                </Button>
              </div>
            }
          />
        </CardFooter>
      </Card>
    </OnboardingShell>
  );
}
