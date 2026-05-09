import { AlertTriangleIcon, MicIcon, RadioIcon } from "lucide-react";

import {
  OnboardingActionBar,
  OnboardingProgressHeader,
  OnboardingShell,
  OnboardingSplitLayout,
} from "@/features/onboarding/components";
import { Button } from "@/components/ui/button";
import {
  PermissionCallout,
  SectionPanel,
  StatusBadge,
} from "@/components/app";
import { DeviceSelector } from "@/features/dictation/components/DeviceSelector";
import { useMicrophoneSelection } from "@/hooks/useMicrophoneSelection";

type MicrophoneReadinessStepProps = {
  error: string | null;
  onBack: () => void;
  onContinue: () => void;
};

export function MicrophoneReadinessStep({
  error,
  onBack,
  onContinue,
}: MicrophoneReadinessStepProps) {
  const {
    activeMicrophone,
    devices,
    error: deviceError,
    hasPermission,
    isLoading,
    isManualUnavailable,
    isResolving,
    manualUnavailableMessage,
    refresh,
    requestMicrophoneAccess,
    requestPermission,
    selectManual,
    selectSystem,
    selection,
  } = useMicrophoneSelection();
  const canContinue = Boolean(activeMicrophone) && !isManualUnavailable;
  const selectionLabel =
    selection.mode === "manual" ? "Specific microphone" : "Automatic default";
  const readinessTone = activeMicrophone
    ? "success"
    : hasPermission
      ? "warning"
      : "neutral";
  const readinessLabel = activeMicrophone
    ? "Ready"
    : hasPermission
      ? "Checking"
      : "Needs access";
  const readinessSummary = activeMicrophone
    ? `Currently using: ${activeMicrophone.label}`
    : "Waiting for an active microphone";
  const readinessDescription = activeMicrophone
    ? "Vaak verified the active input and can move into provider setup."
    : hasPermission
      ? "Vaak has access, but it still needs a working input stream before you continue."
      : "Allow microphone access once so Vaak can confirm your active input.";

  return (
    <OnboardingShell
      header={
        <OnboardingProgressHeader
          step={2}
          totalSteps={4}
          title="Check microphone readiness"
          description="Vaak needs microphone access before you can test dictation."
        />
      }
      footerHint="Microphone settings can be changed later in Settings."
    >
      <OnboardingSplitLayout
        main={
          <SectionPanel
            title="Microphone readiness"
            description="Grant access once, then verify that Vaak can see your active input."
            actions={
              <Button
                type="button"
                size="sm"
                variant={hasPermission ? "outline" : "default"}
                disabled={isResolving}
                onClick={() => void requestMicrophoneAccess()}
              >
                {hasPermission ? "Test microphone" : "Allow microphone access"}
              </Button>
            }
            footer={
              <OnboardingActionBar
                primaryAction={
                  <Button
                    type="button"
                    size="sm"
                    disabled={!canContinue}
                    onClick={onContinue}
                  >
                    Continue
                  </Button>
                }
                secondaryAction={
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onBack}
                  >
                    Back
                  </Button>
                }
              />
            }
            contentClassName="gap-3"
          >
            <div className="flex flex-col gap-3 rounded-lg border bg-card/60 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {readinessSummary}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {readinessDescription}
                  </p>
                </div>
                <StatusBadge tone={readinessTone}>{readinessLabel}</StatusBadge>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <ReadinessDetail
                  label="Access"
                  value={hasPermission ? "Granted" : "Not granted"}
                />
                <ReadinessDetail label="Selection" value={selectionLabel} />
              </div>
            </div>

            <DeviceSelector
              deviceOptions={devices}
              hasPermission={hasPermission}
              isLoading={isLoading}
              manualUnavailableMessage={manualUnavailableMessage}
              selection={selection}
              onRefresh={() => void refresh()}
              onRequestPermission={() => void requestPermission()}
              onSelectManual={(deviceId) => void selectManual(deviceId)}
              onSelectSystem={() => void selectSystem()}
            />

            {deviceError || error ? (
              <PermissionCallout tone="warning" title="Needs attention">
                {deviceError ?? error}
              </PermissionCallout>
            ) : null}
          </SectionPanel>
        }
        aside={<FloatingCapsulePreview />}
        asideClassName="lg:justify-self-end"
      />
    </OnboardingShell>
  );
}

function ReadinessDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function FloatingCapsulePreview() {
  return (
    <div className="mx-auto flex w-full max-w-[18rem] flex-col items-center gap-3 rounded-[1.75rem] border border-border/80 bg-card/70 px-5 py-6 text-center shadow-sm">
      <div className="flex items-center gap-3 rounded-full border border-border bg-background px-4 py-3 shadow-sm">
        <div className="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground">
          <RadioIcon className="size-4" aria-hidden="true" />
        </div>
        <div className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
          <MicIcon className="size-5" aria-hidden="true" />
        </div>
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-4 w-1 rounded-full bg-primary/55" />
          <span className="h-6 w-1 rounded-full bg-primary" />
          <span className="h-5 w-1 rounded-full bg-primary/80" />
          <span className="h-3 w-1 rounded-full bg-primary/55" />
        </div>
        <div className="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground">
          <AlertTriangleIcon className="size-4 rotate-45" aria-hidden="true" />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <StatusBadge tone="neutral">Voice capsule preview</StatusBadge>
        <p className="max-w-[15rem] text-sm text-muted-foreground">
          Vaak stays close while you work, but it does not block local setup.
        </p>
      </div>
    </div>
  );
}
