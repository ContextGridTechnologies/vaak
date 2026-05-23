import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isManualSelectionUnavailable,
  microphoneConstraints,
  resolveActiveMicrophone,
  useMicrophoneSelection,
  type MicrophoneSelection,
} from "./useMicrophoneSelection";

const {
  getMicrophoneSelection,
  isTauriRuntime,
  listenToTauriEvent,
  saveMicrophoneSelection,
  useAudioDevices,
} = vi.hoisted(() => ({
  getMicrophoneSelection: vi.fn(),
  isTauriRuntime: vi.fn(),
  listenToTauriEvent: vi.fn(),
  saveMicrophoneSelection: vi.fn(),
  useAudioDevices: vi.fn(),
}));

vi.mock("@/hooks/useAudioDevices", () => ({
  useAudioDevices,
}));

vi.mock("@/lib/tauri", () => ({
  getMicrophoneSelection,
  isTauriRuntime,
  listenToTauriEvent,
  MICROPHONE_SELECTION_CHANGED_EVENT: "vaak://microphone-selection-changed",
  saveMicrophoneSelection,
}));

const originalMediaDevices = navigator.mediaDevices;
const detachListener = vi.fn();

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
  beforeEach(() => {
    getMicrophoneSelection.mockResolvedValue({ mode: "system" });
    isTauriRuntime.mockReturnValue(false);
    listenToTauriEvent.mockResolvedValue(detachListener);
    saveMicrophoneSelection.mockImplementation(async (selection) => selection);
    useAudioDevices.mockReturnValue({
      devices: [],
      error: null,
      hasPermission: false,
      isLoading: false,
      refresh: vi.fn(),
      requestPermission: vi.fn(),
    });
  });

  afterEach(() => {
    setMediaDevices(originalMediaDevices);
    vi.clearAllMocks();
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

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: expect.objectContaining({
        autoGainControl: true,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      }),
    });
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
      audio: expect.objectContaining({
        autoGainControl: true,
        channelCount: 1,
        deviceId: { exact: "usb-mic" },
        echoCancellation: true,
        noiseSuppression: true,
      }),
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

  it("updates mounted selection state when another window changes the microphone", async () => {
    isTauriRuntime.mockReturnValue(true);
    useAudioDevices.mockReturnValue({
      devices: [{ deviceId: "usb-mic", label: "USB microphone" }],
      error: null,
      hasPermission: false,
      isLoading: false,
      refresh: vi.fn(),
      requestPermission: vi.fn(),
    });
    let eventHandler:
      | ((event: { payload: MicrophoneSelection }) => void | Promise<void>)
      | null = null;
    listenToTauriEvent.mockImplementation(async (_event, handler) => {
      eventHandler = handler;
      return detachListener;
    });

    const { result } = renderHook(() => useMicrophoneSelection());

    await waitFor(() =>
      expect(listenToTauriEvent).toHaveBeenCalledWith(
        "vaak://microphone-selection-changed",
        expect.any(Function),
      ),
    );

    await act(async () => {
      await eventHandler?.({
        payload: { mode: "manual", deviceId: "usb-mic" },
      });
    });

    expect(result.current.selection).toEqual({
      mode: "manual",
      deviceId: "usb-mic",
    });
  });

  it("restores the last saved microphone selection when persistence fails", async () => {
    isTauriRuntime.mockReturnValue(true);
    saveMicrophoneSelection.mockRejectedValue(new Error("settings store unavailable"));
    useAudioDevices.mockReturnValue({
      devices: [{ deviceId: "usb-mic", label: "USB microphone" }],
      error: null,
      hasPermission: false,
      isLoading: false,
      refresh: vi.fn(),
      requestPermission: vi.fn(),
    });

    const { result } = renderHook(() => useMicrophoneSelection());

    await waitFor(() => {
      expect(result.current.selection).toEqual({ mode: "system" });
    });

    await act(async () => {
      await result.current.selectManual("usb-mic");
    });

    expect(result.current.selection).toEqual({ mode: "system" });
    expect(result.current.error).toBe("settings store unavailable");
  });

  it("ignores stale microphone persistence failures after a newer choice is saved", async () => {
    isTauriRuntime.mockReturnValue(true);
    let rejectFirstSave: ((error: Error) => void) | undefined;
    saveMicrophoneSelection
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectFirstSave = reject;
          }),
      )
      .mockResolvedValueOnce({ mode: "manual", deviceId: "conference-mic" });
    useAudioDevices.mockReturnValue({
      devices: [
        { deviceId: "usb-mic", label: "USB microphone" },
        { deviceId: "conference-mic", label: "Conference microphone" },
      ],
      error: null,
      hasPermission: false,
      isLoading: false,
      refresh: vi.fn(),
      requestPermission: vi.fn(),
    });

    const { result } = renderHook(() => useMicrophoneSelection());

    await waitFor(() => {
      expect(result.current.selection).toEqual({ mode: "system" });
    });

    let firstSave: Promise<void> | undefined;
    await act(async () => {
      firstSave = result.current.selectManual("usb-mic");
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.selectManual("conference-mic");
    });
    await act(async () => {
      rejectFirstSave?.(new Error("old save failed"));
      await firstSave;
    });

    expect(result.current.selection).toEqual({
      mode: "manual",
      deviceId: "conference-mic",
    });
    expect(result.current.error).toBeNull();
  });
});
