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

type DeviceSelectorProps = {
  deviceOptions: AudioInputDevice[];
  selectedDeviceId: string;
  isLoading: boolean;
  hasPermission: boolean;
  onSelectDevice: (deviceId: string) => void;
  onRefresh: () => void;
  onRequestPermission: () => void;
};

export function DeviceSelector({
  deviceOptions,
  selectedDeviceId,
  isLoading,
  hasPermission,
  onSelectDevice,
  onRefresh,
  onRequestPermission,
}: DeviceSelectorProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <FieldGroup className="flex-1">
        <Field>
          <FieldLabel>Microphone</FieldLabel>
          <Select
            value={selectedDeviceId}
            onValueChange={onSelectDevice}
            disabled={isLoading}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select microphone" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="default">System default</SelectItem>
                {deviceOptions.map((device, index) => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${index + 1}`}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            Switching devices while recording restarts the recorder
            automatically.
          </FieldDescription>
        </Field>
      </FieldGroup>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="secondary" onClick={onRefresh} disabled={isLoading}>
          {isLoading ? <Spinner data-icon="inline-start" /> : null}
          {isLoading ? "Refreshing..." : "Refresh"}
        </Button>
        {!hasPermission && (
          <Button onClick={onRequestPermission} disabled={isLoading}>
            Enable Microphone
          </Button>
        )}
      </div>
    </div>
  );
}
