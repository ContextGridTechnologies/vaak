import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  MicIcon,
  RadioIcon,
  RefreshCwIcon,
} from "lucide-react";

import {
  OnboardingProgressHeader,
  OnboardingShell,
  OnboardingSplitLayout,
} from "@/features/onboarding/components";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/app";
import {
  isSystemDefaultMicrophoneDuplicate,
  systemDefaultMicrophoneLabel,
} from "@/features/dictation/components/microphoneLabels";
import type { AudioInputDevice } from "@/hooks/useAudioDevices";
import {
  type MicrophoneSelection,
  useMicrophoneSelection,
} from "@/hooks/useMicrophoneSelection";

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
    selectManual,
    selectSystem,
    selection,
  } = useMicrophoneSelection();
  const canContinue = Boolean(activeMicrophone) && !isManualUnavailable;
  const activeMicrophoneLabel = activeMicrophone?.label.trim();
  const activeMicrophoneDisplay = activeMicrophoneLabel || "the active microphone";
  const setupTitle = activeMicrophone
    ? "Microphone ready"
    : "Microphone access needed";
  const setupDescription = activeMicrophone
    ? "Vaak verified the selected input and can continue to provider setup."
    : hasPermission
      ? "Test the selected input so Vaak can confirm the active microphone before provider setup."
      : "Allow access once so Vaak can confirm your active input before provider setup.";

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
        className="lg:grid-cols-[minmax(0,46rem)_20rem]"
        main={
          <Card
            size="sm"
            className="mx-auto w-full max-w-[46rem] rounded-lg shadow-none"
          >
            <CardContent className="flex flex-col gap-5 p-5">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="relative grid size-24 shrink-0 place-items-center rounded-full border bg-muted/40 text-muted-foreground">
                  <MicIcon className="size-10" aria-hidden="true" />
                  <span className="absolute right-1 bottom-1 grid size-7 place-items-center rounded-full border bg-background text-primary shadow-sm">
                    {activeMicrophone ? (
                      <span
                        className="size-2.5 rounded-full bg-primary"
                        aria-hidden="true"
                      />
                    ) : (
                      <AlertTriangleIcon
                        className="size-4"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <p className="text-xl font-medium text-foreground">
                      {setupTitle}
                    </p>
                    <p className="max-w-[32rem] text-sm text-muted-foreground">
                      {setupDescription}
                    </p>
                    {activeMicrophone ? (
                      <p
                        className="max-w-[32rem] truncate text-sm text-muted-foreground"
                        data-testid="active-microphone-label"
                        title={activeMicrophoneDisplay}
                      >
                        {activeMicrophoneDisplay}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <Button
                      type="button"
                      size="sm"
                      variant={hasPermission ? "outline" : "default"}
                      disabled={isResolving}
                      onClick={() => void requestMicrophoneAccess()}
                    >
                      {isResolving ? (
                        <Spinner data-icon="inline-start" />
                      ) : null}
                      {hasPermission
                        ? "Test microphone"
                        : "Allow microphone access"}
                    </Button>
                  </div>
                </div>
              </div>

              <Separator />

              <CompactMicrophoneSelector
                deviceOptions={devices}
                isLoading={isLoading}
                manualUnavailableMessage={manualUnavailableMessage}
                selection={selection}
                onRefresh={() => void refresh()}
                onSelectManual={(deviceId) => void selectManual(deviceId)}
                onSelectSystem={() => void selectSystem()}
              />

              {deviceError || error ? (
                <Alert>
                  <AlertTriangleIcon aria-hidden="true" />
                  <AlertTitle>Needs attention</AlertTitle>
                  <AlertDescription>{deviceError ?? error}</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
            <CardFooter className="justify-between gap-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onBack}
              >
                <ArrowLeftIcon data-icon="inline-start" />
                Back
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!canContinue}
                onClick={onContinue}
              >
                Continue
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </CardFooter>
          </Card>
        }
        aside={<FloatingCapsulePreview />}
        asideClassName="lg:justify-self-end"
      />
    </OnboardingShell>
  );
}

type CompactMicrophoneSelectorProps = {
  deviceOptions: AudioInputDevice[];
  selection: MicrophoneSelection;
  isLoading: boolean;
  manualUnavailableMessage?: string | null;
  onSelectManual: (deviceId: string) => void;
  onSelectSystem: () => void;
  onRefresh: () => void;
};

function CompactMicrophoneSelector({
  deviceOptions,
  selection,
  isLoading,
  manualUnavailableMessage,
  onSelectManual,
  onSelectSystem,
  onRefresh,
}: CompactMicrophoneSelectorProps) {
  const selectableDevices = deviceOptions.filter(
    (device) =>
      device.deviceId.trim().length > 0 &&
      device.deviceId !== "default" &&
      !isSystemDefaultMicrophoneDuplicate(device, deviceOptions),
  );
  const selectedValue =
    selection.mode === "manual" ? selection.deviceId : "system";
  const defaultMicrophoneLabel = systemDefaultMicrophoneLabel(deviceOptions);
  const selectedMicrophoneLabel =
    selection.mode === "manual"
      ? selectableDevices.find((device) => device.deviceId === selection.deviceId)
          ?.label || "Unavailable microphone"
      : defaultMicrophoneLabel;

  return (
    <FieldGroup className="gap-3">
      <Field>
        <FieldLabel className="font-semibold text-foreground">
          Default microphone
        </FieldLabel>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            value={selectedValue}
            onValueChange={(value) => {
              if (value === "system") {
                onSelectSystem();
                return;
              }
              onSelectManual(value);
            }}
            disabled={isLoading}
          >
            <SelectTrigger
              size="sm"
              className="h-10 w-full min-w-0 text-left sm:flex-1 [&>svg]:shrink-0"
            >
              <SelectValue placeholder="Select microphone">
                <span
                  className="block min-w-0 truncate"
                  data-testid="selected-microphone-label"
                  title={selectedMicrophoneLabel}
                >
                  {selectedMicrophoneLabel}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent
              position="popper"
              align="start"
              className="w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)]"
            >
              <SelectGroup>
                <SelectItem
                  className="items-start py-2 whitespace-normal break-words"
                  value="system"
                >
                  {defaultMicrophoneLabel}
                </SelectItem>
                {selectableDevices.map((device, index) => (
                  <SelectItem
                    key={device.deviceId}
                    className="items-start py-2 whitespace-normal break-words"
                    value={device.deviceId}
                  >
                    {device.label || `Microphone ${index + 1}`}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
          >
            {isLoading ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCwIcon data-icon="inline-start" />
            )}
            {isLoading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
        {manualUnavailableMessage ? (
          <FieldDescription className="text-destructive">
            {manualUnavailableMessage}
          </FieldDescription>
        ) : null}
      </Field>
    </FieldGroup>
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
