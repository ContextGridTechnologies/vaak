import { MicIcon } from "lucide-react";

import {
  PermissionCallout,
  SectionPanel,
  StatusBadge,
} from "@/components/app";
import { Button } from "@/components/ui/button";
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
  const activeMicrophoneLabel =
    activeMicrophone && selection.mode === "system"
      ? `${microphoneDisplayName(activeMicrophone.label)} (system default)`
      : activeMicrophone?.label;
  const summary = activeMicrophone
    ? `Currently using: ${activeMicrophoneLabel}`
    : hasPermission
      ? "Vaak can access microphone devices."
      : "Microphone access has not been granted yet.";
  const description = activeMicrophone
    ? "This input will be used for local dictation capture."
    : hasPermission
      ? "Run a microphone test to confirm the active input stream."
      : "Allow access once, then use the default input or choose a specific microphone.";

  return (
    <SectionPanel
      title="Microphone"
      description="Choose the input device Vaak uses for dictation."
      actions={
        <Button
          type="button"
          size="sm"
          variant={hasPermission ? "outline" : "default"}
          disabled={isResolving || isManualUnavailable}
          onClick={() => void requestMicrophoneAccess()}
        >
          <MicIcon data-icon="inline-start" aria-hidden="true" />
          {hasPermission ? "Test microphone" : "Allow microphone access"}
        </Button>
      }
      contentClassName="gap-3"
    >
      <div className="flex flex-col gap-3 rounded-lg border bg-card/60 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {summary}
            </p>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <StatusBadge tone={readinessTone}>{readinessLabel}</StatusBadge>
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

      {error ? (
        <PermissionCallout tone="warning" title="Needs attention">
          {error}
        </PermissionCallout>
      ) : null}
    </SectionPanel>
  );
}
