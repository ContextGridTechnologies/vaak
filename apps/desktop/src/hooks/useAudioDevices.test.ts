import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAudioDevices } from "./useAudioDevices";

type MockMediaDevice = {
  kind: MediaDeviceKind;
  deviceId: string;
  label: string;
};

const originalMediaDevices = navigator.mediaDevices;

function setMediaDevices(value: Partial<MediaDevices> | undefined) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value,
  });
}

describe("useAudioDevices", () => {
  beforeEach(() => {
    setMediaDevices({
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      enumerateDevices: vi.fn().mockResolvedValue([
        {
          kind: "audioinput",
          deviceId: "default",
          label: "Default microphone",
        },
        {
          kind: "audioinput",
          deviceId: "usb",
          label: "USB microphone",
        },
        {
          kind: "videoinput",
          deviceId: "camera",
          label: "Camera",
        },
      ] satisfies MockMediaDevice[]),
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
      }),
    });
  });

  afterEach(() => {
    setMediaDevices(originalMediaDevices);
  });

  it("lists audio input devices and derives permission from labeled microphones", async () => {
    const { result } = renderHook(() => useAudioDevices());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.devices).toEqual([
      { deviceId: "default", label: "Default microphone" },
      { deviceId: "usb", label: "USB microphone" },
    ]);
    expect(result.current.hasPermission).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("requests microphone permission, stops the permission stream, and refreshes devices", async () => {
    const stop = vi.fn();
    const mediaDevices = navigator.mediaDevices as MediaDevices & {
      getUserMedia: ReturnType<typeof vi.fn>;
      enumerateDevices: ReturnType<typeof vi.fn>;
    };
    mediaDevices.getUserMedia.mockResolvedValueOnce({
      getTracks: () => [{ stop }],
    });

    const { result } = renderHook(() => useAudioDevices());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.requestPermission();
    });

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(mediaDevices.enumerateDevices).toHaveBeenCalledTimes(2);
  });

  it("reports unsupported device enumeration clearly", async () => {
    setMediaDevices(undefined);

    const { result } = renderHook(() => useAudioDevices());

    await waitFor(() =>
      expect(result.current.error).toBe(
        "Audio device enumeration is not available.",
      ),
    );
    expect(result.current.devices).toEqual([]);
    expect(result.current.hasPermission).toBe(false);
  });
});
