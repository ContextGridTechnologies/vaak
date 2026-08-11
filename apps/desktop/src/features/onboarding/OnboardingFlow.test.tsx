import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderApp } from "@/test/render";
import {
  createTauriCommandHarness,
  expectTauriCommand,
} from "@/test/tauri";

import { OnboardingGate } from "./OnboardingFlow";

const analyticsState = vi.hoisted(() => ({
  analytics: {
    capture: vi.fn(),
    captureAppOpened: vi.fn(),
    captureError: vi.fn(),
    errorTelemetryEnabled: false,
    setErrorTelemetryEnabled: vi.fn(),
    setUsageAnalyticsEnabled: vi.fn(),
    usageAnalyticsEnabled: false,
  },
}));

vi.mock("@/lib/analytics/browser", () => analyticsState);

vi.mock("./HotkeyReadinessStep", () => ({
  HotkeyReadinessStep: ({
    onBack,
    onContinue,
  }: {
    onBack: () => void;
    onContinue: () => void;
  }) => (
    <div>
      <h1>Set your hold-to-talk shortcut</h1>
      <button type="button" onClick={onBack}>
        Back
      </button>
      <button type="button" onClick={onContinue}>
        Continue
      </button>
    </div>
  ),
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
const originalFetch = globalThis.fetch;

function setMediaDevices(value: Partial<MediaDevices> | undefined) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value,
  });
}

describe("OnboardingGate", () => {
  beforeEach(() => {
    analyticsState.analytics.capture.mockReset();
    analyticsState.analytics.captureAppOpened.mockReset();
    analyticsState.analytics.captureError.mockReset();
    analyticsState.analytics.setErrorTelemetryEnabled.mockReset();
    analyticsState.analytics.setUsageAnalyticsEnabled.mockReset();
    const track: MockTrack = {
      label: "Default microphone",
      stop: vi.fn(),
      getSettings: () => ({ deviceId: "default" }),
    };

    setMediaDevices({
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      enumerateDevices: vi
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
            label: "Default microphone",
          },
        ] satisfies MockMediaDevice[]),
      getUserMedia: vi.fn().mockResolvedValue({
        getAudioTracks: () => [track],
        getTracks: () => [track],
      }),
    });
  });

  afterEach(() => {
    setMediaDevices(originalMediaDevices);
    globalThis.fetch = originalFetch;
  });

  it("shows the first-run mode choice before the app shell when onboarding starts", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_onboarding_state", {
      completed: false,
      currentStep: "modeChoice",
      selectedMode: null,
    });

    renderApp(
      <OnboardingGate>
        <div>Voice app shell</div>
      </OnboardingGate>,
    );

    expect(
      await screen.findByRole("heading", { name: "Choose how to use Vaak" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Local setup")).toBeInTheDocument();
    expect(screen.getByText("No account required")).toBeInTheDocument();
    expect(screen.getByText("Bring your own provider key")).toBeInTheDocument();
    expect(screen.getByText("Settings stay on this device")).toBeInTheDocument();
    expect(screen.getByText("Managed Vaak")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Use Vaak without provider setup when managed plans are available.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Coming soon")).toHaveLength(2);
    expect(screen.queryByText("Coming later")).not.toBeInTheDocument();
    expect(screen.queryByText("Available now")).not.toBeInTheDocument();
    expect(screen.queryByText("Optional account path")).not.toBeInTheDocument();
    expect(
      screen.getByText("You can change this later in Settings."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Voice app shell")).not.toBeInTheDocument();

    expectTauriCommand(tauri, "get_onboarding_state", undefined);
  });

  it("persists local mode, shows microphone readiness, and then shows provider setup", async () => {
    const user = userEvent.setup();
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_onboarding_state", {
      completed: false,
      currentStep: "modeChoice",
      selectedMode: null,
    });
    tauri.resolveCommand("save_onboarding_mode", {
      completed: false,
      currentStep: "microphoneReadiness",
      selectedMode: "local",
    });
    tauri.resolveCommand("save_onboarding_step", {
      completed: false,
      currentStep: "providerSetup",
      selectedMode: "local",
    });

    renderApp(
      <OnboardingGate>
        <div>Voice app shell</div>
      </OnboardingGate>,
    );

    await user.click(
      await screen.findByRole("button", { name: "Continue locally" }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Check microphone readiness",
      }),
    ).toBeInTheDocument();
    expect(analyticsState.analytics.capture).toHaveBeenCalledWith(
      "onboarding_started",
      {
        entry_point: "first_run",
        mode: "local",
      },
    );
    expect(screen.queryByText("Voice app shell")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Allow microphone access" }),
    );

    await waitFor(() => {
      expect(screen.getByText("Microphone ready")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Vaak verified the selected input and can continue to provider setup.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole("combobox")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Test microphone" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByRole("heading", {
        name: "Connect a speech provider",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Voice app shell")).not.toBeInTheDocument();
    expectTauriCommand(tauri, "save_onboarding_mode", { mode: "local" });
    expectTauriCommand(tauri, "save_onboarding_step", {
      step: "providerSetup",
    });
  });

  it("resumes hotkey readiness instead of dropping into the app shell", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_onboarding_state", {
      completed: false,
      currentStep: "hotkeyReadiness",
      selectedMode: "local",
    });

    renderApp(
      <OnboardingGate>
        <div>Voice app shell</div>
      </OnboardingGate>,
    );

    expect(
      await screen.findByRole("heading", {
        name: "Set your hold-to-talk shortcut",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Voice app shell")).not.toBeInTheDocument();
  });

  it("goes back to provider setup from hotkey readiness", async () => {
    const user = userEvent.setup();
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_onboarding_state", {
      completed: false,
      currentStep: "hotkeyReadiness",
      selectedMode: "local",
    });
    tauri.resolveCommand("save_onboarding_step", {
      completed: false,
      currentStep: "providerSetup",
      selectedMode: "local",
    });
    tauri.resolveCommand("get_provider_status", {
      providerId: "openai",
      configured: false,
      configComplete: true,
    });
    tauri.resolveCommand("get_provider_config", null);
    tauri.resolveCommand("get_selected_speech_provider", "openai");

    renderApp(
      <OnboardingGate>
        <div>Voice app shell</div>
      </OnboardingGate>,
    );

    await user.click(await screen.findByRole("button", { name: "Back" }));

    expectTauriCommand(tauri, "save_onboarding_step", {
      step: "providerSetup",
    });
    expect(
      await screen.findByRole("heading", {
        name: "Connect a speech provider",
      }),
    ).toBeInTheDocument();
  });

  it("moves from hotkey readiness to analytics consent before completing setup", async () => {
    const user = userEvent.setup();
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_onboarding_state", {
      completed: false,
      currentStep: "hotkeyReadiness",
      selectedMode: "local",
    });
    tauri.resolveCommand("save_onboarding_step", {
      completed: false,
      currentStep: "analyticsConsent",
      selectedMode: "local",
    });

    renderApp(
      <OnboardingGate>
        <div>Voice app shell</div>
      </OnboardingGate>,
    );

    await user.click(await screen.findByRole("button", { name: "Continue" }));

    expectTauriCommand(tauri, "save_onboarding_step", {
      step: "analyticsConsent",
    });
    expect(
      await screen.findByRole("heading", { name: "Optional usage analytics" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Voice app shell")).not.toBeInTheDocument();
  });

  it("offers usage analytics consent before completing setup", async () => {
    const user = userEvent.setup();
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_onboarding_state", {
      completed: false,
      currentStep: "analyticsConsent",
      selectedMode: "local",
    });
    tauri.resolveCommand("complete_onboarding", {
      completed: true,
      currentStep: "analyticsConsent",
      selectedMode: "local",
    });

    renderApp(
      <OnboardingGate>
        <div>Voice app shell</div>
      </OnboardingGate>,
    );

    expect(
      await screen.findByRole("heading", { name: "Optional usage analytics" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("analytics-consent-card")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Allow Vaak to send anonymous product-usage events when you use the app?",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This helps us understand feature usage and reliability.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You can change this later in Settings."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Audio, transcripts, API keys, and file paths stay on your device.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-split-layout")).not.toBeInTheDocument();
    expect(screen.queryByText("How consent works")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Enable analytics" }),
    );

    expect(analyticsState.analytics.setUsageAnalyticsEnabled).toHaveBeenCalledWith(
      true,
    );
    expect(analyticsState.analytics.captureAppOpened).toHaveBeenCalledOnce();
    expectTauriCommand(tauri, "complete_onboarding", undefined);
    expect(analyticsState.analytics.capture).toHaveBeenCalledWith(
      "onboarding_completed",
      { mode: "local" },
    );
    expect(await screen.findByText("Voice app shell")).toBeInTheDocument();
  });

  it("can finish setup without enabling usage analytics", async () => {
    const user = userEvent.setup();
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_onboarding_state", {
      completed: false,
      currentStep: "analyticsConsent",
      selectedMode: "local",
    });
    tauri.resolveCommand("complete_onboarding", {
      completed: true,
      currentStep: "analyticsConsent",
      selectedMode: "local",
    });

    renderApp(
      <OnboardingGate>
        <div>Voice app shell</div>
      </OnboardingGate>,
    );

    expect(
      await screen.findByRole("heading", { name: "Optional usage analytics" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Not now" }));

    expect(analyticsState.analytics.setUsageAnalyticsEnabled).toHaveBeenCalledWith(
      false,
    );
    expect(analyticsState.analytics.captureAppOpened).not.toHaveBeenCalled();
    expectTauriCommand(tauri, "complete_onboarding", undefined);
    expect(await screen.findByText("Voice app shell")).toBeInTheDocument();
  });

  it("captures a sanitized onboarding save failure", async () => {
    const user = userEvent.setup();
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_onboarding_state", {
      completed: false,
      currentStep: "modeChoice",
      selectedMode: null,
    });
    tauri.rejectCommand(
      "save_onboarding_mode",
      new Error("settings path failed"),
    );

    renderApp(
      <OnboardingGate>
        <div>Voice app shell</div>
      </OnboardingGate>,
    );

    await user.click(
      await screen.findByRole("button", { name: "Continue locally" }),
    );

    expect(analyticsState.analytics.capture).toHaveBeenCalledWith(
      "onboarding_failed",
      {
        error_code: "settings_save_failed",
        error_stage: "mode_choice",
      },
    );
    expect(analyticsState.analytics.captureError).toHaveBeenCalledWith(
      expect.any(Error),
      {
        code: "settings_save_failed",
        handled: true,
        stage: "onboarding",
      },
    );
  });

  it("resumes the microphone readiness step instead of dropping into the app shell", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_onboarding_state", {
      completed: false,
      currentStep: "microphoneReadiness",
      selectedMode: "local",
    });

    renderApp(
      <OnboardingGate>
        <div>Voice app shell</div>
      </OnboardingGate>,
    );

    expect(
      await screen.findByRole("heading", {
        name: "Check microphone readiness",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Voice app shell")).not.toBeInTheDocument();
  });

  it("resumes provider setup instead of dropping into the app shell", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_onboarding_state", {
      completed: false,
      currentStep: "providerSetup",
      selectedMode: "local",
    });
    tauri.resolveCommand("get_provider_status", {
      providerId: "openai",
      configured: false,
      configComplete: true,
    });
    tauri.resolveCommand("get_provider_config", null);
    tauri.resolveCommand("get_selected_speech_provider", "openai");

    renderApp(
      <OnboardingGate>
        <div>Voice app shell</div>
      </OnboardingGate>,
    );

    expect(
      await screen.findByRole("heading", {
        name: "Connect a speech provider",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Vaak sends audio only to the provider you choose."),
    ).toBeInTheDocument();
    expect(screen.getByText("Provider keys stay on this device.")).toBeInTheDocument();
    expect(screen.queryByText("Voice app shell")).not.toBeInTheDocument();
  });

  it("saves microphone readiness when going back from provider setup", async () => {
    const user = userEvent.setup();
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_onboarding_state", {
      completed: false,
      currentStep: "providerSetup",
      selectedMode: "local",
    });
    tauri.resolveCommand("get_provider_status", {
      providerId: "openai",
      configured: false,
      configComplete: true,
    });
    tauri.resolveCommand("get_provider_config", null);
    tauri.resolveCommand("get_selected_speech_provider", "openai");
    tauri.resolveCommand("save_onboarding_step", {
      completed: false,
      currentStep: "microphoneReadiness",
      selectedMode: "local",
    });

    renderApp(
      <OnboardingGate>
        <div>Voice app shell</div>
      </OnboardingGate>,
    );

    await user.click(await screen.findByRole("button", { name: "Back" }));

    expectTauriCommand(tauri, "save_onboarding_step", {
      step: "microphoneReadiness",
    });
    expect(
      await screen.findByRole("heading", {
        name: "Check microphone readiness",
      }),
    ).toBeInTheDocument();
  });

  it("shows setup load recovery when onboarding state cannot be loaded", async () => {
    const tauri = createTauriCommandHarness();
    tauri.rejectCommand("get_onboarding_state", new Error("settings failed"));

    renderApp(
      <OnboardingGate>
        <div>Voice app shell</div>
      </OnboardingGate>,
    );

    expect(
      await screen.findByRole("heading", { name: "Setup needs attention" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("settings failed")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Choose how to use Vaak" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Voice app shell")).not.toBeInTheDocument();
  });

  it("falls back to setup instead of entering the app shell for unknown incomplete steps", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_onboarding_state", {
      completed: false,
      currentStep: "linuxPermissions",
      selectedMode: "local",
    });

    renderApp(
      <OnboardingGate>
        <div>Voice app shell</div>
      </OnboardingGate>,
    );

    expect(
      await screen.findByRole("heading", { name: "Choose how to use Vaak" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Voice app shell")).not.toBeInTheDocument();
  });

  it("records onboarding bootstrap checkpoints for completed users", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("record_startup_checkpoint", undefined);
    tauri.resolveCommand("get_onboarding_state", {
      completed: true,
      currentStep: "hotkeyReadiness",
      selectedMode: "local",
    });

    renderApp(
      <OnboardingGate>
        <div>Voice app shell</div>
      </OnboardingGate>,
    );

    expect(await screen.findByText("Voice app shell")).toBeInTheDocument();
    await waitFor(() => {
      expectTauriCommand(tauri, "record_startup_checkpoint", {
        windowLabel: "main",
        checkpoint: "onboarding_state_requested",
      });
    });
    expectTauriCommand(tauri, "record_startup_checkpoint", {
      windowLabel: "main",
      checkpoint: "onboarding_state_loaded",
      detail: "completed",
    });
  });
});
