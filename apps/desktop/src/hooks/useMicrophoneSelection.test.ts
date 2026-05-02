import { describe, expect, it, vi, afterEach } from "vitest";

import {
  isManualSelectionUnavailable,
  microphoneConstraints,
  resolveActiveMicrophone,
  type MicrophoneSelection,
} from "./useMicrophoneSelection";

const originalMediaDevices = navigator.mediaDevices;

type MockTrack = {
  label: string;
  stop: ReturnType<typeof vi.fn>;
  getSettings: () => MediaTrackSettings;
};

function setMediaDevices(value: Partial<MediaDevices> | undefined) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value,
  });
}

function streamWithTrack(track: MockTrack): MediaStream {
  return {
    getAudioTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
}

describe("microphone selection", () => {
  afterEach(() => {
    setMediaDevices(originalMediaDevices);
  });

  it("opens a system-selected stream and reports the active track instead of the first device", async () => {
    const track = {
      label: "Studio USB microphone",
      stop: vi.fn(),
      getSettings: () => ({ deviceId: "studio-usb" }),
    };
    const getUserMedia = vi.fn().mockResolvedValue(streamWithTrack(track));
    setMediaDevices({ getUserMedia });

    const active = await resolveActiveMicrophone({ mode: "system" });

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(active).toEqual({
      deviceId: "studio-usb",
      label: "Studio USB microphone",
    });
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it("opens manual streams with exact device constraints", async () => {
    const selection: MicrophoneSelection = {
      mode: "manual",
      deviceId: "usb-mic",
    };

    expect(microphoneConstraints(selection)).toEqual({
      audio: { deviceId: { exact: "usb-mic" } },
    });
  });

  it("detects when a manual microphone selection is unavailable", () => {
    expect(
      isManualSelectionUnavailable(
        { mode: "manual", deviceId: "missing-mic" },
        [{ deviceId: "usb-mic", label: "USB microphone" }],
      ),
    ).toBe(true);

    expect(
      isManualSelectionUnavailable(
        { mode: "system" },
        [{ deviceId: "usb-mic", label: "USB microphone" }],
      ),
    ).toBe(false);
  });
});
