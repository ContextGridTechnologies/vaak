import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderApp } from "@/test/render";

import { MicrophoneReadinessStep } from "./MicrophoneReadinessStep";

type MockMediaDevice = {
  kind: MediaDeviceKind;
  deviceId: string;
  label: string;
};

type MockTrack = {
  label: string;
  stop: ReturnType<typeof vi.fn>;
  getSettings: () => MediaTrackSettings;
};

const originalMediaDevices = navigator.mediaDevices;
const originalHasPointerCapture = HTMLElement.prototype.hasPointerCapture;
const originalReleasePointerCapture = HTMLElement.prototype.releasePointerCapture;
const originalSetPointerCapture = HTMLElement.prototype.setPointerCapture;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

function setMediaDevices(value: Partial<MediaDevices> | undefined) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value,
  });
}

describe("MicrophoneReadinessStep", () => {
  beforeEach(() => {
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.scrollIntoView = vi.fn();

    const enumerateDevices = vi
      .fn()
      .mockResolvedValueOnce([
        {
          kind: "audioinput",
          deviceId: "default",
          label: "",
        },
        {
          kind: "audioinput",
          deviceId: "laptop-mic",
          label: "",
        },
      ] satisfies MockMediaDevice[])
      .mockResolvedValueOnce([
        {
          kind: "audioinput",
          deviceId: "default",
          label: "Default - Studio USB microphone",
        },
        {
          kind: "audioinput",
          deviceId: "laptop-mic",
          label: "Laptop microphone",
        },
        {
          kind: "audioinput",
          deviceId: "studio-usb",
          label: "Studio USB microphone",
        },
      ] satisfies MockMediaDevice[]);
    const track: MockTrack = {
      label: "Studio USB microphone",
      stop: vi.fn(),
      getSettings: () => ({ deviceId: "studio-usb" }),
    };

    setMediaDevices({
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      enumerateDevices,
      getUserMedia: vi.fn().mockResolvedValue({
        getAudioTracks: () => [track],
        getTracks: () => [track],
      }),
    });
  });

  afterEach(() => {
    setMediaDevices(originalMediaDevices);
    HTMLElement.prototype.hasPointerCapture = originalHasPointerCapture;
    HTMLElement.prototype.releasePointerCapture = originalReleasePointerCapture;
    HTMLElement.prototype.setPointerCapture = originalSetPointerCapture;
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  it("requests microphone access and enables continue after a microphone is detected", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();

    renderApp(
      <MicrophoneReadinessStep
        error={null}
        onBack={() => undefined}
        onContinue={onContinue}
      />,
    );

    expect(
      await screen.findByRole("heading", {
        name: "Check microphone readiness",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Allow microphone access" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Allow microphone access" }),
    ).toHaveAttribute("data-size", "sm");
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveAttribute("data-size", "sm");
    expect(screen.getByRole("combobox")).toHaveClass("whitespace-normal");
    expect(screen.queryByText("Provider setup next")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Once your microphone is ready, continue into provider setup.",
      ),
    ).not.toBeInTheDocument();

    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(continueButton).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: "Allow microphone access" }),
    );

    await waitFor(() => {
      expect(
        screen.getAllByText("Currently using: Studio USB microphone"),
      ).toHaveLength(1);
      expect(
        screen.getByRole("button", { name: "Test microphone" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Test microphone" }),
      ).toHaveAttribute("data-size", "sm");
      expect(screen.getByRole("combobox")).toBeInTheDocument();
      expect(screen.getByRole("combobox")).toHaveAttribute("data-size", "sm");
      expect(screen.getByRole("combobox")).toHaveClass("whitespace-normal");
      expect(
        screen.getByText("Studio USB microphone (system default)"),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Refresh" })).toHaveAttribute(
        "data-size",
        "xs",
      );
      expect(continueButton).toHaveAttribute("data-size", "sm");
      expect(screen.getByRole("button", { name: "Back" })).toHaveAttribute(
        "data-size",
        "sm",
      );
      expect(continueButton).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: "Test microphone" }));

    await user.click(continueButton);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("shows manual-unavailable warnings when the selected microphone disappears", async () => {
    const enumerateDevices = vi
      .fn()
      .mockResolvedValueOnce([
        {
          kind: "audioinput",
          deviceId: "default",
          label: "",
        },
        {
          kind: "audioinput",
          deviceId: "studio-usb",
          label: "",
        },
      ] satisfies MockMediaDevice[])
      .mockResolvedValueOnce([
        {
          kind: "audioinput",
          deviceId: "laptop-mic",
          label: "Laptop microphone",
        },
        {
          kind: "audioinput",
          deviceId: "studio-usb",
          label: "Studio USB microphone",
        },
      ] satisfies MockMediaDevice[])
      .mockResolvedValueOnce([
        {
          kind: "audioinput",
          deviceId: "laptop-mic",
          label: "Laptop microphone",
        },
      ] satisfies MockMediaDevice[]);
    const track: MockTrack = {
      label: "Studio USB microphone",
      stop: vi.fn(),
      getSettings: () => ({ deviceId: "studio-usb" }),
    };

    setMediaDevices({
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      enumerateDevices,
      getUserMedia: vi.fn().mockResolvedValue({
        getAudioTracks: () => [track],
        getTracks: () => [track],
      }),
    });

    const user = userEvent.setup();

    renderApp(
      <MicrophoneReadinessStep
        error={null}
        onBack={() => undefined}
        onContinue={() => undefined}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: "Allow microphone access" }),
    );

    await waitFor(() => {
      expect(
        screen.getAllByText("Currently using: Studio USB microphone"),
      ).toHaveLength(1);
      expect(screen.getByRole("button", { name: "Test microphone" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    });

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("Studio USB microphone"));
    await user.click(screen.getByRole("button", { name: "Refresh" }));

    const unavailableMessage =
      "Selected microphone is unavailable. Choose another device or switch to automatic mode.";

    await waitFor(() => {
      expect(screen.getAllByText(unavailableMessage).length).toBeGreaterThan(0);
      expect(screen.getByText("Needs attention")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    });
  });
});
