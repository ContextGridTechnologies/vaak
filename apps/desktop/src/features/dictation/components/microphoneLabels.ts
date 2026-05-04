import type { AudioInputDevice } from "@/hooks/useAudioDevices";

export function systemDefaultMicrophoneLabel(
  deviceOptions: AudioInputDevice[],
) {
  const defaultDevice = deviceOptions.find(
    (device) => device.deviceId === "default",
  );

  return `${microphoneDisplayName(defaultDevice?.label)} (system default)`;
}

export function isSystemDefaultMicrophoneDuplicate(
  device: AudioInputDevice,
  deviceOptions: AudioInputDevice[],
) {
  const defaultDevice = deviceOptions.find(
    (option) => option.deviceId === "default",
  );

  if (!defaultDevice?.label.trim()) {
    return false;
  }

  return (
    normalizedMicrophoneName(device.label) ===
    normalizedMicrophoneName(defaultDevice.label)
  );
}

export function microphoneDisplayName(label?: string | null) {
  const trimmed = label?.trim() ?? "";
  const withoutDefaultPrefix = trimmed
    .replace(/^default\s*[-:–—]\s*/i, "")
    .trim();

  return withoutDefaultPrefix || "Default microphone";
}

function normalizedMicrophoneName(label?: string | null) {
  return microphoneDisplayName(label).toLocaleLowerCase();
}
