import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAudioRecorder } from "./useAudioRecorder";

const originalMediaDevices = navigator.mediaDevices;
const originalMediaRecorder = globalThis.MediaRecorder;
const originalAudioContext = globalThis.AudioContext;
const originalAudioWorkletNode = globalThis.AudioWorkletNode;
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

type MockTrack = {
  label?: string;
  stop: ReturnType<typeof vi.fn>;
  getSettings?: () => MediaTrackSettings;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  dispatch: (event: string) => void;
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

class MockAudioWorkletNode {
  static instances: MockAudioWorkletNode[] = [];

  port: {
    onmessage: ((event: MessageEvent) => void) | null;
  } = {
    onmessage: null,
  };

  constructor() {
    MockAudioWorkletNode.instances.push(this);
  }

  disconnect() {}
}

class MockAudioContext {
  audioWorklet = {
    addModule: vi.fn().mockResolvedValue(undefined),
  };

  sampleRate = 16000;
  state: AudioContextState = "running";

  createMediaStreamSource() {
    return {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }

  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
}

function setMediaDevices(value: Partial<MediaDevices> | undefined) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value,
  });
}

function createMockTrack({
  label = "USB microphone",
  deviceId = "usb-mic",
}: {
  label?: string;
  deviceId?: string;
} = {}): MockTrack {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  return {
    label,
    stop: vi.fn(),
    getSettings: () => ({ deviceId }),
    addEventListener: vi.fn((event: string, listener: EventListenerOrEventListenerObject) => {
      const eventListeners = listeners.get(event) ?? new Set();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
    }),
    removeEventListener: vi.fn(
      (event: string, listener: EventListenerOrEventListenerObject) => {
        listeners.get(event)?.delete(listener);
      },
    ),
    dispatch: (event: string) => {
      for (const listener of listeners.get(event) ?? []) {
        if (typeof listener === "function") {
          listener(new Event(event));
        } else {
          listener.handleEvent(new Event(event));
        }
      }
    },
  };
}

function createMockMediaDevices(getUserMedia: ReturnType<typeof vi.fn>) {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  return {
    getUserMedia: getUserMedia as unknown as MediaDevices["getUserMedia"],
    addEventListener: vi.fn(
      (event: string, listener: EventListenerOrEventListenerObject) => {
        const eventListeners = listeners.get(event) ?? new Set();
        eventListeners.add(listener);
        listeners.set(event, eventListeners);
      },
    ),
    removeEventListener: vi.fn(
      (event: string, listener: EventListenerOrEventListenerObject) => {
        listeners.get(event)?.delete(listener);
      },
    ),
    dispatch: (event: string) => {
      for (const listener of listeners.get(event) ?? []) {
        if (typeof listener === "function") {
          listener(new Event(event));
        } else {
          listener.handleEvent(new Event(event));
        }
      }
    },
  };
}

describe("useAudioRecorder", () => {
  beforeEach(() => {
    MockMediaRecorder.instances = [];
    MockAudioWorkletNode.instances = [];
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T00:00:00.000Z"));

    URL.createObjectURL = vi.fn().mockReturnValue("blob:recording");
    URL.revokeObjectURL = vi.fn();
    globalThis.MediaRecorder =
      MockMediaRecorder as unknown as typeof MediaRecorder;
    globalThis.AudioContext =
      MockAudioContext as unknown as typeof AudioContext;
    globalThis.AudioWorkletNode =
      MockAudioWorkletNode as unknown as typeof AudioWorkletNode;
  });

  afterEach(() => {
    vi.useRealTimers();
    setMediaDevices(originalMediaDevices);
    globalThis.MediaRecorder = originalMediaRecorder;
    globalThis.AudioContext = originalAudioContext;
    globalThis.AudioWorkletNode = originalAudioWorkletNode;
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
    const track = createMockTrack();
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
      audio: expect.objectContaining({
        autoGainControl: true,
        channelCount: 1,
        deviceId: { exact: "usb-mic" },
        echoCancellation: true,
        noiseSuppression: true,
      }),
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
    expect(result.current.startupMetrics).toEqual({
      analysisMs: 0,
      startupMs: 0,
      streamAcquisitionMs: 0,
      reusedWarmStream: false,
    });
    expect(track.stop).not.toHaveBeenCalled();
  });

  it("uses system microphone constraints in system mode", async () => {
    const getUserMedia = vi.fn().mockResolvedValue({
      getAudioTracks: () => [
        createMockTrack({
          label: "System selected microphone",
          deviceId: "system-active",
        }),
      ],
      getTracks: () => [
        createMockTrack({
          label: "System selected microphone",
          deviceId: "system-active",
        }),
      ],
    });
    setMediaDevices({ getUserMedia });
    const { result } = renderHook(() =>
      useAudioRecorder({ microphoneSelection: { mode: "system" } }),
    );

    await act(async () => {
      await result.current.start();
    });

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: expect.objectContaining({
        autoGainControl: true,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      }),
    });
    expect(result.current.activeMicrophone?.label).toBe(
      "System selected microphone",
    );
    expect(result.current.startupMetrics?.reusedWarmStream).toBe(false);
  });

  it("revokes generated object URLs when reset", async () => {
    const trackStop = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({
      getAudioTracks: () => [],
      getTracks: () => [{ stop: trackStop }],
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
    expect(trackStop).toHaveBeenCalledTimes(1);
  });

  it("warms and reuses the microphone stream across recordings", async () => {
    const track = createMockTrack();
    const stream = {
      getAudioTracks: () => [track],
      getTracks: () => [track],
    };
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    setMediaDevices({ getUserMedia });
    const { result } = renderHook(() =>
      useAudioRecorder({
        microphoneSelection: { mode: "manual", deviceId: "usb-mic" },
      }),
    );

    await act(async () => {
      await result.current.prepare();
    });

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      result.current.stop();
    });
    await act(async () => {
      await result.current.start();
    });

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(MockMediaRecorder.instances).toHaveLength(2);
    expect(result.current.startupMetrics).toEqual({
      startupMs: 0,
      streamAcquisitionMs: 0,
      reusedWarmStream: true,
    });
    expect(track.stop).not.toHaveBeenCalled();

    act(() => {
      result.current.reset();
    });

    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it("aborts active recording when the microphone stream ends", async () => {
    const track = createMockTrack();
    const getUserMedia = vi.fn().mockResolvedValue({
      getAudioTracks: () => [track],
      getTracks: () => [track],
    });
    setMediaDevices({ getUserMedia });
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe("recording");

    act(() => {
      track.dispatch("ended");
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe(
      "Microphone stream ended. Start dictation again.",
    );
    expect(result.current.activeMicrophone).toBeNull();
    expect(result.current.audioBlob).toBeNull();
    expect(result.current.audioUrl).toBeNull();
    expect(MockMediaRecorder.instances[0]?.state).toBe("inactive");
  });

  it("invalidates the warm stream when microphone devices change", async () => {
    const track = createMockTrack();
    const getUserMedia = vi.fn().mockResolvedValue({
      getAudioTracks: () => [track],
      getTracks: () => [track],
    });
    const mediaDevices = createMockMediaDevices(getUserMedia);
    setMediaDevices(mediaDevices);
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.prepare();
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    act(() => {
      mediaDevices.dispatch("devicechange");
    });
    await act(async () => {
      await result.current.start();
    });

    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("recording");
  });

  it("aborts an active recording when the microphone selection changes", async () => {
    const firstTrack = createMockTrack({
      label: "Built-in microphone",
      deviceId: "built-in",
    });
    const getUserMedia = vi.fn().mockResolvedValue({
      getAudioTracks: () => [firstTrack],
      getTracks: () => [firstTrack],
    });
    setMediaDevices({ getUserMedia });
    const { result, rerender } = renderHook(
      ({ deviceId }: { deviceId: string }) =>
        useAudioRecorder({
          microphoneSelection: { mode: "manual", deviceId },
        }),
      { initialProps: { deviceId: "built-in" } },
    );

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe("recording");

    rerender({ deviceId: "usb-mic" });

    expect(firstTrack.stop).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("idle");
    expect(result.current.audioBlob).toBeNull();
    expect(result.current.audioUrl).toBeNull();
    expect(MockMediaRecorder.instances[0]?.state).toBe("inactive");
  });

  it("produces capture analysis for valid speech and exposes wav transcription segments", async () => {
    const track = createMockTrack();
    const getUserMedia = vi.fn().mockResolvedValue({
      getAudioTracks: () => [track],
      getTracks: () => [track],
    });
    setMediaDevices({ getUserMedia });
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.start();
    });

    emitAnalysisSamples([
      silenceMs(300),
      toneMs(900, 0.28),
      silenceMs(300),
    ]);

    await act(async () => {
      result.current.stop();
    });

    expect(result.current.captureAnalysis?.disposition).toBe("ready");
    expect(result.current.captureAnalysis?.transcriptionSegments).toHaveLength(1);
    expect(result.current.captureAnalysis?.transcriptionSegments[0]?.type).toBe(
      "audio/wav",
    );
  });

  it("publishes live microphone level while recording and clears it after stop", async () => {
    const track = createMockTrack();
    const getUserMedia = vi.fn().mockResolvedValue({
      getAudioTracks: () => [track],
      getTracks: () => [track],
    });
    setMediaDevices({ getUserMedia });
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      emitAnalysisSamples([toneMs(120, 0.32)]);
    });

    expect(result.current.audioLevel).toBeGreaterThan(0.2);

    await act(async () => {
      result.current.stop();
    });

    expect(result.current.audioLevel).toBe(0);
  });

  it("marks low-volume speech as unclear before transcription", async () => {
    const track = createMockTrack();
    const getUserMedia = vi.fn().mockResolvedValue({
      getAudioTracks: () => [track],
      getTracks: () => [track],
    });
    setMediaDevices({ getUserMedia });
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.start();
    });

    emitAnalysisSamples([
      silenceMs(250),
      toneMs(800, 0.012),
      silenceMs(200),
    ]);

    await act(async () => {
      result.current.stop();
    });

    expect(result.current.captureAnalysis?.disposition).toBe("unclear");
    expect(result.current.captureAnalysis?.reason).toBe("low_volume");
    expect(result.current.captureAnalysis?.transcriptionSegments).toHaveLength(0);
  });
});

function emitAnalysisSamples(chunks: Float32Array[]) {
  const node =
    MockAudioWorkletNode.instances[
      MockAudioWorkletNode.instances.length - 1
    ];
  if (!node?.port.onmessage) {
    throw new Error("Analysis worklet node is not ready.");
  }

  for (const chunk of chunks) {
    node.port.onmessage({
      data: {
        type: "samples",
        sampleRate: 16000,
        samples: Array.from(chunk),
      },
    } as MessageEvent);
  }
}

function silenceMs(durationMs: number) {
  return new Float32Array(Math.round((durationMs / 1000) * 16000));
}

function toneMs(durationMs: number, amplitude: number) {
  const frameCount = Math.round((durationMs / 1000) * 16000);
  const samples = new Float32Array(frameCount);
  for (let index = 0; index < frameCount; index += 1) {
    samples[index] = Math.sin((2 * Math.PI * 220 * index) / 16000) * amplitude;
  }
  return samples;
}
