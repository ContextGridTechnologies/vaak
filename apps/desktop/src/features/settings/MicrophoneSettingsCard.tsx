import { MicIcon } from "lucide-react";

import { PermissionCallout } from "@/components/app";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import {
  DeviceSelector,
  microphoneDisplayName,
} from "@/features/dictation/components";
import { useMicrophoneSelection } from "@/hooks/useMicrophoneSelection";

export function MicrophoneSettingsCard() {
  const {
    activeMicrophone,
    devices,
    error,
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
  const readinessLabel = activeMicrophone
    ? "Ready"
    : hasPermission
      ? "Checking"
      : "Needs access";
  const readinessTone = activeMicrophone
    ? "border-success/20 bg-success/10 text-success"
    : hasPermission
      ? "border-warning/30 bg-warning/15 text-warning-foreground"
      : "border-destructive/20 bg-destructive/10 text-destructive";
  const activeMicrophoneLabel =
    activeMicrophone && selection.mode === "system"
      ? microphoneDisplayName(activeMicrophone.label)
      : activeMicrophone?.label;
  const summary = hasPermission
    ? "Vaak can access microphone devices."
    : "Microphone access has not been granted yet.";
  const description = activeMicrophone
    ? "This input will be used for local dictation capture."
    : hasPermission
      ? "Run a microphone test to confirm the active input stream."
      : "Allow access once, then use the default input or choose a specific microphone.";

  return (
    <Card size="sm" className="rounded-lg bg-transparent py-0 shadow-none ring-0">
      <CardContent className="px-0">
        <FieldGroup className="gap-0">
          <Separator className="mb-6 bg-border/70" />

          <section
            aria-labelledby="microphone-input-device-heading"
            className="flex flex-col gap-4"
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3
                  id="microphone-input-device-heading"
                  className="text-base font-semibold text-foreground"
                >
                  Input device
                </h3>
                <p className="text-sm text-muted-foreground">
                  Select the microphone used for local voice capture.
                </p>
              </div>
              <Badge
                variant="outline"
                className={`mt-0.5 ${readinessTone}`}
              >
                {readinessLabel}
              </Badge>
            </div>

            <div className="flex flex-col gap-3 rounded-md border border-border/70 bg-background/70 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-1 gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background text-foreground">
                  <MicIcon className="size-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  {activeMicrophoneLabel ? (
                    <>
                      <p className="text-xs font-medium text-muted-foreground">
                        Currently using
                      </p>
                      <p
                        className="truncate text-sm font-semibold text-foreground"
                        title={activeMicrophoneLabel}
                      >
                        {activeMicrophoneLabel}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm font-medium text-foreground">
                      {summary}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant={hasPermission ? "outline" : "default"}
                className="w-fit sm:shrink-0"
                disabled={isResolving || isManualUnavailable}
                onClick={() => void requestMicrophoneAccess()}
              >
                <MicIcon data-icon="inline-start" aria-hidden="true" />
                {hasPermission ? "Test microphone" : "Allow microphone access"}
              </Button>
            </div>
          </section>

          <Separator className="my-6 bg-border/70" />

          <section
            aria-labelledby="microphone-device-selection-heading"
            className="flex flex-col gap-4"
          >
            <div>
              <h3
                id="microphone-device-selection-heading"
                className="text-base font-semibold text-foreground"
              >
                Device selection
              </h3>
              <p className="text-sm text-muted-foreground">
                Vaak follows the OS default unless you choose a specific microphone.
              </p>
            </div>

            <div className="rounded-md border border-border/70 bg-background/70 p-4">
              <DeviceSelector
                deviceOptions={devices}
                hasPermission={hasPermission}
                isLoading={isLoading}
                manualUnavailableMessage={manualUnavailableMessage}
                selection={selection}
                compactRefresh
                showDescription={false}
                onRefresh={() => void refresh()}
                onRequestPermission={() => void requestPermission()}
                onSelectManual={(deviceId) => void selectManual(deviceId)}
                onSelectSystem={() => void selectSystem()}
              />
            </div>
          </section>

          {error ? (
            <div className="pt-4">
              <PermissionCallout tone="warning" title="Needs attention">
                {error}
              </PermissionCallout>
            </div>
          ) : null}
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
