import { RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { Spinner } from "@/components/ui/spinner";
import type { AudioInputDevice } from "@/hooks/useAudioDevices";
import type { MicrophoneSelection } from "@/hooks/useMicrophoneSelection";
import { cn } from "@/lib/utils";

import {
  isSystemDefaultMicrophoneDuplicate,
  systemDefaultMicrophoneLabel,
} from "./microphoneLabels";

type DeviceSelectorProps = {
  deviceOptions: AudioInputDevice[];
  selection: MicrophoneSelection;
  isLoading: boolean;
  hasPermission: boolean;
  manualUnavailableMessage?: string | null;
  onSelectManual: (deviceId: string) => void;
  onSelectSystem: () => void;
  onRefresh: () => void;
  onRequestPermission: () => void;
  compactRefresh?: boolean;
};

export function DeviceSelector({
  deviceOptions,
  selection,
  isLoading,
  hasPermission,
  manualUnavailableMessage,
  onSelectManual,
  onSelectSystem,
  onRefresh,
  onRequestPermission,
  compactRefresh = false,
}: DeviceSelectorProps) {
  const selectableDevices = deviceOptions.filter(
    (device) =>
      device.deviceId.trim().length > 0 &&
      device.deviceId !== "default" &&
      !isSystemDefaultMicrophoneDuplicate(device, deviceOptions),
  );
  const selectedValue =
    selection.mode === "manual" ? selection.deviceId : "system";
  const defaultMicrophoneLabel =
    systemDefaultMicrophoneLabel(deviceOptions);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3">
        <FieldGroup className="min-w-0 flex-1">
          <Field>
            <FieldLabel>Microphone</FieldLabel>
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
                  className={cn(
                    "h-auto min-h-7 w-full min-w-0 items-start py-1.5 text-left sm:flex-1",
                    compactRefresh
                      ? "whitespace-nowrap [&_[data-slot=select-value]]:truncate [&_[data-slot=select-value]]:whitespace-nowrap"
                      : "whitespace-normal [&_[data-slot=select-value]]:line-clamp-none [&_[data-slot=select-value]]:whitespace-normal",
                  )}
                >
                  <SelectValue placeholder="Select microphone" />
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
              <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                {compactRefresh ? (
                  <Button
                    aria-label={
                      isLoading
                        ? "Refreshing microphone devices"
                        : "Refresh microphone devices"
                    }
                    title={
                      isLoading
                        ? "Refreshing microphone devices"
                        : "Refresh microphone devices"
                    }
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={onRefresh}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Spinner aria-hidden="true" />
                    ) : (
                      <RefreshCwIcon aria-hidden="true" />
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={onRefresh}
                    disabled={isLoading}
                  >
                    {isLoading ? <Spinner data-icon="inline-start" /> : null}
                    {isLoading ? "Refreshing..." : "Refresh"}
                  </Button>
                )}
                {!hasPermission && (
                  <Button
                    size="sm"
                    onClick={onRequestPermission}
                    disabled={isLoading}
                  >
                    Enable Microphone
                  </Button>
                )}
              </div>
            </div>
            <FieldDescription>
              {selection.mode === "manual"
                ? "Pinned to this input until you switch back to automatic mode."
                : "Vaak follows this OS default unless you choose a specific microphone."}
            </FieldDescription>
            {manualUnavailableMessage ? (
              <FieldDescription className="text-destructive">
                {manualUnavailableMessage}
              </FieldDescription>
            ) : null}
          </Field>
        </FieldGroup>
      </div>
    </div>
  );
}
