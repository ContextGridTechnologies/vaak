import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { selectComboboxOption } from "@/test/select";
import { renderApp } from "@/test/render";

import { MicrophoneReadinessStep } from "./MicrophoneReadinessStep";

const tauriApi = vi.hoisted(() => ({
  getMicrophoneSelection: vi.fn(),
  isTauriRuntime: vi.fn(),
  saveMicrophoneSelection: vi.fn(),
}));

vi.mock("@/lib/tauri", async () => ({
  ...(await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri")),
  ...tauriApi,
}));

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
    vi.clearAllMocks();
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    tauriApi.isTauriRuntime.mockReturnValue(false);
    tauriApi.getMicrophoneSelection.mockResolvedValue({ mode: "system" });
    tauriApi.saveMicrophoneSelection.mockImplementation((selection) =>
      Promise.resolve(selection),
    );

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
    expect(screen.getAllByRole("button", { name: "Allow microphone access" }))
      .toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Enable Microphone" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Microphone readiness" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Access required")).not.toBeInTheDocument();
    expect(screen.queryByText("No active input yet")).not.toBeInTheDocument();
    expect(screen.queryByText("Access")).not.toBeInTheDocument();
    expect(screen.queryByText("Input")).not.toBeInTheDocument();
    expect(screen.queryByText("Selection")).not.toBeInTheDocument();
    expect(screen.getByText("Microphone access needed")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Allow access once so Vaak can confirm your active input before provider setup.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Default microphone")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveAttribute("data-size", "sm");
    expect(screen.getByRole("combobox")).toHaveClass("whitespace-nowrap");
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toHaveAttribute(
      "data-size",
      "sm",
    );
    expect(
      screen.queryByText(
        "Vaak follows this OS default unless you choose a specific microphone.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Default microphone")).toHaveClass(
      "text-foreground",
    );
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
        screen.getByText("Microphone ready"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Test microphone" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Test microphone" }),
      ).toHaveAttribute("data-size", "sm");
      expect(screen.getByRole("combobox")).toBeInTheDocument();
      expect(screen.getByRole("combobox")).toHaveAttribute("data-size", "sm");
      expect(screen.getByRole("combobox")).toHaveClass("whitespace-nowrap");
      expect(
        screen.getByText("Studio USB microphone (system default)"),
      ).toBeInTheDocument();
      expect(screen.getByText("Microphone ready")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Vaak verified the selected input and can continue to provider setup.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText("Access allowed")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Active input detected"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "Microphone readiness" }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Refresh" })).toHaveAttribute(
        "data-size",
        "sm",
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
        screen.getByText("Microphone ready"),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Test microphone" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    });

    await selectComboboxOption(
      user,
      screen.getByRole("combobox"),
      "Studio USB microphone",
    );
    await user.click(screen.getByRole("button", { name: "Refresh" }));

    const unavailableMessage =
      "Selected microphone is unavailable. Choose another device or switch to automatic mode.";

    await waitFor(() => {
      expect(enumerateDevices).toHaveBeenCalledTimes(3);
      expect(screen.getAllByText(unavailableMessage).length).toBeGreaterThan(0);
      expect(screen.getByText("Needs attention")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    });
  });

  it("keeps long Windows microphone names constrained in the setup card", async () => {
    const longMicrophoneName =
      "Microphone Array (Intel® Smart Sound Technology for Digital Microphones)";
    const enumerateDevices = vi
      .fn()
      .mockResolvedValueOnce([
        {
          kind: "audioinput",
          deviceId: "default",
          label: "",
        },
      ] satisfies MockMediaDevice[])
      .mockResolvedValueOnce([
        {
          kind: "audioinput",
          deviceId: "default",
          label: `Default - ${longMicrophoneName}`,
        },
      ] satisfies MockMediaDevice[]);
    const track: MockTrack = {
      label: longMicrophoneName,
      stop: vi.fn(),
      getSettings: () => ({ deviceId: "default" }),
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

    const selectedMicrophone = await screen.findByTestId(
      "selected-microphone-label",
    );

    expect(selectedMicrophone).toHaveTextContent(
      `${longMicrophoneName} (system default)`,
    );
    expect(selectedMicrophone).toHaveClass("truncate");
    expect(selectedMicrophone).toHaveAttribute(
      "title",
      `${longMicrophoneName} (system default)`,
    );
    expect(screen.getByTestId("active-microphone-label")).toHaveClass(
      "truncate",
    );
    expect(screen.getByTestId("active-microphone-label")).toHaveAttribute(
      "title",
      longMicrophoneName,
    );
  });

  it("shows structured Tauri microphone selection errors", async () => {
    tauriApi.isTauriRuntime.mockReturnValue(true);
    tauriApi.getMicrophoneSelection.mockRejectedValue({
      code: "microphone_store_failed",
      message: "settings file is locked",
    });

    renderApp(
      <MicrophoneReadinessStep
        error={null}
        onBack={() => undefined}
        onContinue={() => undefined}
      />,
    );

    expect(
      await screen.findByText(
        "microphone_store_failed: settings file is locked",
      ),
    ).toBeInTheDocument();
  });
});
