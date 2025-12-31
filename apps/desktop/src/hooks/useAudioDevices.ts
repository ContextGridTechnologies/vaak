import { useCallback, useEffect, useState } from "react";

export type AudioInputDevice = {
  deviceId: string;
  label: string;
};

type UseAudioDevicesState = {
  devices: AudioInputDevice[];
  isLoading: boolean;
  hasPermission: boolean;
  error: string | null;
};

type UseAudioDevicesActions = {
  refresh: () => Promise<void>;
  requestPermission: () => Promise<void>;
};

export function useAudioDevices(): UseAudioDevicesState & UseAudioDevicesActions {
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setError("Audio device enumeration is not available.");
      setDevices([]);
      setHasPermission(false);
      return;
    }

    setIsLoading(true);
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = list
        .filter((device) => device.kind === "audioinput")
        .map((device) => ({
          deviceId: device.deviceId,
          label: device.label,
        }));
      setDevices(audioInputs);
      setHasPermission(audioInputs.some((device) => device.label.length > 0));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list devices.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone access is not available in this environment.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone access failed.");
    }
  }, [refresh]);

  useEffect(() => {
    refresh();

    const handleDeviceChange = () => {
      refresh();
    };

    navigator.mediaDevices?.addEventListener("devicechange", handleDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener(
        "devicechange",
        handleDeviceChange,
      );
    };
  }, [refresh]);

  return {
    devices,
    isLoading,
    hasPermission,
    error,
    refresh,
    requestPermission,
  };
}
