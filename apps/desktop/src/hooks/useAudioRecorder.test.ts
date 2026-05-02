import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAudioRecorder } from "./useAudioRecorder";

const originalMediaDevices = navigator.mediaDevices;
const originalMediaRecorder = globalThis.MediaRecorder;
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

type MockTrack = {
  label?: string;
  stop: ReturnType<typeof vi.fn>;
  getSettings?: () => MediaTrackSettings;
};

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];

  state: RecordingState = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(public stream: MediaStream) {
    MockMediaRecorder.instances.push(this);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob(["audio"], { type: "audio/webm" }),
    } as BlobEvent);
    this.onstop?.();
  }
}

function setMediaDevices(value: Partial<MediaDevices> | undefined) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value,
  });
}

describe("useAudioRecorder", () => {
  beforeEach(() => {
    MockMediaRecorder.instances = [];
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T00:00:00.000Z"));

    URL.createObjectURL = vi.fn().mockReturnValue("blob:recording");
    URL.revokeObjectURL = vi.fn();
    globalThis.MediaRecorder =
      MockMediaRecorder as unknown as typeof MediaRecorder;
  });

  afterEach(() => {
    vi.useRealTimers();
    setMediaDevices(originalMediaDevices);
    globalThis.MediaRecorder = originalMediaRecorder;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  it("reports when microphone recording is unavailable", async () => {
    setMediaDevices(undefined);
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe(
      "Microphone access is not available in this environment.",
    );
  });

  it("records from the selected microphone and publishes a captured blob on stop", async () => {
    const track: MockTrack = {
      label: "USB microphone",
      stop: vi.fn(),
      getSettings: () => ({ deviceId: "usb-mic" }),
    };
    const getUserMedia = vi.fn().mockResolvedValue({
      getAudioTracks: () => [track],
      getTracks: () => [track],
    });
    setMediaDevices({ getUserMedia });
    const { result } = renderHook(() =>
      useAudioRecorder({
        microphoneSelection: { mode: "manual", deviceId: "usb-mic" },
      }),
    );

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe("recording");
    expect(result.current.activeMicrophone).toEqual({
      deviceId: "usb-mic",
      label: "USB microphone",
    });
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { deviceId: { exact: "usb-mic" } },
    });

    vi.setSystemTime(new Date("2026-05-01T00:00:02.000Z"));
    await act(async () => {
      result.current.stop();
    });

    expect(result.current.status).toBe("stopped");
    expect(result.current.audioBlob).toBeInstanceOf(Blob);
    expect(result.current.audioBlob?.type).toBe("audio/webm");
    expect(result.current.audioUrl).toBe("blob:recording");
    expect(result.current.elapsedMs).toBe(2000);
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it("uses system microphone constraints in system mode", async () => {
    const getUserMedia = vi.fn().mockResolvedValue({
      getAudioTracks: () => [
        {
          label: "System selected microphone",
          stop: vi.fn(),
          getSettings: () => ({ deviceId: "system-active" }),
        },
      ],
      getTracks: () => [{ stop: vi.fn() }],
    });
    setMediaDevices({ getUserMedia });
    const { result } = renderHook(() =>
      useAudioRecorder({ microphoneSelection: { mode: "system" } }),
    );

    await act(async () => {
      await result.current.start();
    });

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(result.current.activeMicrophone?.label).toBe(
      "System selected microphone",
    );
  });

  it("revokes generated object URLs when reset", async () => {
    const getUserMedia = vi.fn().mockResolvedValue({
      getAudioTracks: () => [],
      getTracks: () => [{ stop: vi.fn() }],
    });
    setMediaDevices({ getUserMedia });
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      result.current.stop();
    });
    expect(result.current.audioUrl).toBe("blob:recording");

    act(() => {
      result.current.reset();
    });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:recording");
    expect(result.current.status).toBe("idle");
    expect(result.current.audioBlob).toBeNull();
    expect(result.current.audioUrl).toBeNull();
  });
});
