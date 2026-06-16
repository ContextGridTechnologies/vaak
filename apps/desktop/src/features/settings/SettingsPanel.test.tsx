import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { azureReadyStatus, openAiNeedsKeyStatus } from "@/test/fixtures";
import { renderApp } from "@/test/render";

import { SettingsPanel } from "./SettingsPanel";

const providerApi = vi.hoisted(() => ({
  getProviderStatus: vi.fn(),
  getProviderConfig: vi.fn(),
  getSelectedSpeechProvider: vi.fn(),
  saveSpeechProviderSetup: vi.fn(),
  testSpeechProvider: vi.fn(),
  isTauriRuntime: vi.fn(),
  listenToTauriEvent: vi.fn(),
  getMicrophoneSelection: vi.fn(),
  saveMicrophoneSelection: vi.fn(),
  getHotkeyBindings: vi.fn(),
  saveDictationHotkey: vi.fn(),
  getSystemSettings: vi.fn(),
  saveSystemSettings: vi.fn(),
  getAppShellPreferences: vi.fn(),
  restartVoiceCapsule: vi.fn(),
  resetVoiceCapsulePosition: vi.fn(),
  disableVoiceCapsule: vi.fn(),
  enableVoiceCapsule: vi.fn(),
  getDiagnosticsLocations: vi.fn(),
}));
const openerApi = vi.hoisted(() => ({
  revealItemInDir: vi.fn(),
}));
const analyticsApi = vi.hoisted(() => ({
  analytics: {
    capture: vi.fn(),
    captureError: vi.fn(),
    setErrorTelemetryEnabled: vi.fn(),
    setUsageAnalyticsEnabled: vi.fn(),
  },
}));

vi.mock("@/lib/tauri", () => ({
  ...providerApi,
  MICROPHONE_SELECTION_CHANGED_EVENT: "vaak://microphone-selection-changed",
}));
vi.mock("@tauri-apps/plugin-opener", () => openerApi);
vi.mock("@/lib/analytics/browser", () => analyticsApi);

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

describe("SettingsPanel provider setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.scrollIntoView = vi.fn();

    const enumerateDevices = vi.fn().mockResolvedValue([
      {
        kind: "audioinput",
        deviceId: "default",
        label: "Default - Studio USB microphone",
      },
      {
        kind: "audioinput",
        deviceId: "studio-usb",
        label: "Studio USB microphone",
      },
      {
        kind: "audioinput",
        deviceId: "conference-mic",
        label: "Conference microphone",
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

    providerApi.isTauriRuntime.mockReturnValue(false);
    providerApi.listenToTauriEvent.mockResolvedValue(() => {});
    providerApi.getMicrophoneSelection.mockResolvedValue({ mode: "system" });
    providerApi.saveMicrophoneSelection.mockImplementation((selection) =>
      Promise.resolve(selection),
    );
    providerApi.getHotkeyBindings.mockResolvedValue({
      dictation: "Ctrl+Win",
      command: "Ctrl+Win+Alt",
    });
    providerApi.saveDictationHotkey.mockResolvedValue({
      dictation: "Ctrl+Shift",
      command: "Ctrl+Shift+Alt",
    });
    providerApi.getSystemSettings.mockResolvedValue({
      dictationMode: "auto",
      launchOnStartup: true,
      showSkippedTranscripts: false,
    });
    providerApi.saveSystemSettings.mockImplementation((settings) =>
      Promise.resolve(settings),
    );
    providerApi.getAppShellPreferences.mockResolvedValue({
      sidebarCollapsed: false,
      voiceCapsuleEnabled: true,
    });
    providerApi.restartVoiceCapsule.mockResolvedValue(undefined);
    providerApi.resetVoiceCapsulePosition.mockResolvedValue({
      anchor: "bottomCenter",
    });
    providerApi.disableVoiceCapsule.mockResolvedValue({
      sidebarCollapsed: false,
      voiceCapsuleEnabled: false,
    });
    providerApi.enableVoiceCapsule.mockResolvedValue({
      sidebarCollapsed: false,
      voiceCapsuleEnabled: true,
    });
    providerApi.getDiagnosticsLocations.mockResolvedValue({
      logDir: "C:\\Users\\nikhi\\AppData\\Local\\ai.vaak.desktop\\logs",
      configDir: "C:\\Users\\nikhi\\AppData\\Roaming\\ai.vaak.desktop",
    });
    providerApi.getProviderStatus.mockImplementation((providerId: string) => {
      if (providerId === "azure-openai") {
        return Promise.resolve(azureReadyStatus());
      }
      return Promise.resolve(openAiNeedsKeyStatus());
    });
    providerApi.getProviderConfig.mockResolvedValue({
      endpoint: "https://example.openai.azure.com",
      deploymentId: "gpt-4o-transcribe",
      apiVersion: "2025-04-01-preview",
    });
    providerApi.getSelectedSpeechProvider.mockResolvedValue("azure-openai");
    providerApi.testSpeechProvider.mockResolvedValue(azureReadyStatus());
  });

  afterEach(() => {
    setMediaDevices(originalMediaDevices);
    HTMLElement.prototype.hasPointerCapture = originalHasPointerCapture;
    HTMLElement.prototype.releasePointerCapture = originalReleasePointerCapture;
    HTMLElement.prototype.setPointerCapture = originalSetPointerCapture;
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  it("loads the active Azure provider without showing the OpenAI form", async () => {
    renderApp(<SettingsPanel />);

    const endpointInput = await screen.findByLabelText("Endpoint");
    await waitFor(() => {
      expect(endpointInput).toHaveValue("https://example.openai.azure.com");
    });
    expect(screen.getByRole("heading", { name: "Azure OpenAI" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Speech provider" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Settings" }).closest('[data-slot="card"]'),
    ).toBeNull();
    expect(
      screen.getByText("Providers, microphone, hotkey, and app preferences.").closest(
        '[data-slot="card"]',
      ),
    ).toBeNull();
    expect(
      screen
        .getByRole("heading", { name: "Speech provider" })
        .closest('[data-slot="card"]'),
    ).not.toBeNull();
    expect(screen.queryByText("Transcription mode")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Choose the input device Vaak uses for dictation."),
    ).not.toBeInTheDocument();

    expect(screen.getByTestId("settings-screen-shell")).toHaveClass(
      "mx-auto",
      "w-full",
      "max-w-[52rem]",
    );
    expect(screen.getByTestId("settings-screen-shell").parentElement).toHaveClass(
      "py-5",
      "lg:py-6",
    );
    expect(screen.getByTestId("settings-screen-shell").parentElement).not.toHaveClass(
      "pt-[4.05rem]",
      "sm:pt-[5.0625rem]",
      "lg:pt-[6.075rem]",
    );

    expect(screen.queryByRole("heading", { name: "OpenAI" })).not.toBeInTheDocument();
    expect(endpointInput).toHaveValue(
      "https://example.openai.azure.com",
    );
    expect(screen.getByLabelText("Deployment ID")).toHaveValue(
      "gpt-4o-transcribe",
    );
    expect(screen.getByLabelText("API version")).toHaveValue(
      "2025-04-01-preview",
    );
    expect(analyticsApi.analytics.capture).toHaveBeenCalledWith(
      "settings_opened",
      { section: "settings" },
    );
  });

  it("renders only microphone settings when selected", async () => {
    renderApp(<SettingsPanel activeSection="microphone" />);

    expect((await screen.findAllByText("Microphone")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Speech provider")).not.toBeInTheDocument();
    expect(screen.queryByText("Transcription mode")).not.toBeInTheDocument();

    const microphoneCard = screen
      .getByText("Choose the input device Vaak uses for dictation.")
      .closest('[data-slot="card"]') as HTMLElement | null;
    expect(microphoneCard).not.toBeNull();
    expect(within(microphoneCard!).getAllByText("Microphone").length).toBeGreaterThan(
      0,
    );
    expect(
      within(microphoneCard!).getByRole("button", { name: "Test microphone" }),
    ).toBeInTheDocument();
    expect(
      within(microphoneCard!).getByText("Studio USB microphone (system default)"),
    ).toBeInTheDocument();
    expect(
      within(microphoneCard!).getByText(
        "Vaak follows this OS default unless you choose a specific microphone.",
      ),
    ).toBeInTheDocument();
    expect(
      within(microphoneCard!).queryByText("System selected"),
    ).not.toBeInTheDocument();

    await userEvent.click(within(microphoneCard!).getByRole("combobox"));

    expect(
      await screen.findByRole("option", {
        name: "Studio USB microphone (system default)",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Studio USB microphone" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Conference microphone" }),
    ).toBeInTheDocument();

    expect(
      screen.queryByText("Change the hold-to-talk shortcut used by the voice capsule."),
    ).not.toBeInTheDocument();
  });

  it("renders only transcription mode controls when selected", async () => {
    renderApp(<SettingsPanel activeSection="transcription-mode" />);

    const behaviorCard = (
      await screen.findByText("Transcription mode")
    ).closest('[data-slot="card"]') as HTMLElement | null;
    expect(behaviorCard).not.toBeNull();
    expect(
      within(behaviorCard!).getByText(
        "Choose whether Vaak prioritizes speed or final transcript quality.",
      ),
    ).toBeInTheDocument();
    expect(within(behaviorCard!).getByText("Speed vs accuracy")).toBeInTheDocument();
    expect(screen.queryByText("Speech provider")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Choose the input device Vaak uses for dictation."),
    ).not.toBeInTheDocument();
  });

  it("keeps optional telemetry controls inside the system setting card", async () => {
    const user = userEvent.setup();
    renderApp(<SettingsPanel activeSection="system" />);

    const systemCard = (await screen.findByText("System setting")).closest(
      '[data-slot="card"]',
    ) as HTMLElement | null;
    expect(systemCard).not.toBeNull();
    expect(within(systemCard!).getByText("Usage analytics")).toBeInTheDocument();

    const toggle = within(systemCard!).getByRole("switch", {
      name: "Share privacy-safe usage analytics",
    });
    expect(toggle).not.toBeChecked();

    await user.click(toggle);

    expect(toggle).toBeChecked();
    expect(analyticsApi.analytics.setUsageAnalyticsEnabled).toHaveBeenCalledWith(true);
    expect(analyticsApi.analytics.capture).toHaveBeenCalledWith(
      "setting_changed",
      {
        enabled: true,
        setting_id: "usage_analytics",
      },
    );

    const crashReportsToggle = within(systemCard!).getByRole("switch", {
      name: "Send sanitized crash reports",
    });
    expect(crashReportsToggle).not.toBeChecked();

    await user.click(crashReportsToggle);

    expect(crashReportsToggle).toBeChecked();
    expect(analyticsApi.analytics.setErrorTelemetryEnabled).toHaveBeenCalledWith(
      true,
    );
    expect(analyticsApi.analytics.capture).toHaveBeenCalledWith(
      "setting_changed",
      {
        enabled: true,
        setting_id: "error_diagnostics",
      },
    );
    expect(screen.getAllByText("System setting")).toHaveLength(1);
  });

  it("lets users control whether Vaak starts on startup", async () => {
    const user = userEvent.setup();
    renderApp(<SettingsPanel activeSection="system" />);

    const systemCard = (await screen.findByText("System setting")).closest(
      '[data-slot="card"]',
    ) as HTMLElement | null;
    expect(systemCard).not.toBeNull();
    expect(
      within(systemCard!).getByText("Control how Vaak integrates with your desktop session."),
    ).toBeInTheDocument();

    const toggle = within(systemCard!).getByRole("switch", {
      name: "Start Vaak on startup",
    });
    expect(toggle).toBeChecked();

    await user.click(toggle);

    expect(toggle).not.toBeChecked();
    await waitFor(() => {
      expect(providerApi.saveSystemSettings).toHaveBeenCalledWith({
        dictationMode: "auto",
        launchOnStartup: false,
        showSkippedTranscripts: false,
      });
    });
    expect(analyticsApi.analytics.capture).toHaveBeenCalledWith(
      "setting_changed",
      {
        enabled: false,
        setting_id: "launch_on_startup",
      },
    );
  });

  it("captures handled telemetry when a system setting save fails", async () => {
    providerApi.saveSystemSettings.mockRejectedValue({
      code: "settings_save_failed",
      message: "could not update startup preference",
    });
    const user = userEvent.setup();
    renderApp(<SettingsPanel activeSection="system" />);

    const systemCard = (await screen.findByText("System setting")).closest(
      '[data-slot="card"]',
    ) as HTMLElement | null;
    expect(systemCard).not.toBeNull();

    await user.click(
      within(systemCard!).getByRole("switch", {
        name: "Start Vaak on startup",
      }),
    );

    expect(
      await screen.findByText(
        "settings_save_failed: could not update startup preference",
      ),
    ).toBeInTheDocument();
    expect(analyticsApi.analytics.captureError).toHaveBeenCalledWith(
      {
        code: "settings_save_failed",
        message: "could not update startup preference",
      },
      {
        code: "settings_save_failed",
        handled: true,
        stage: "settings",
      },
    );
  });

  it("keeps skipped transcript rows hidden by default with an application setting", async () => {
    const user = userEvent.setup();
    renderApp(<SettingsPanel activeSection="system" />);

    const systemCard = (await screen.findByText("System setting")).closest(
      '[data-slot="card"]',
    ) as HTMLElement | null;
    expect(systemCard).not.toBeNull();
    expect(within(systemCard!).getByText("Skipped transcripts")).toBeInTheDocument();

    const toggle = within(systemCard!).getByRole("switch", {
      name: "Show skipped transcripts in Voice Activity",
    });
    expect(toggle).not.toBeChecked();

    await user.click(toggle);

    expect(toggle).toBeChecked();
    await waitFor(() => {
      expect(providerApi.saveSystemSettings).toHaveBeenCalledWith({
        dictationMode: "auto",
        launchOnStartup: true,
        showSkippedTranscripts: true,
      });
    });
    expect(analyticsApi.analytics.capture).toHaveBeenCalledWith(
      "setting_changed",
      {
        enabled: true,
        setting_id: "show_skipped_transcripts",
      },
    );
  });

  it("saves transcription mode as a global system setting", async () => {
    const user = userEvent.setup();
    renderApp(<SettingsPanel activeSection="transcription-mode" />);

    const behaviorCard = (
      await screen.findByText("Transcription mode")
    ).closest('[data-slot="card"]') as HTMLElement | null;
    expect(behaviorCard).not.toBeNull();
    expect(
      within(behaviorCard!).getByText(
        "Choose whether Vaak prioritizes speed or final transcript quality.",
      ),
    ).toBeInTheDocument();
    expect(within(behaviorCard!).getByText("Speed vs accuracy")).toBeInTheDocument();
    expect(
      within(behaviorCard!).getByRole("radio", {
        name: "Fast transcription",
      }),
    ).toBeInTheDocument();
    expect(
      within(behaviorCard!).getByRole("radio", {
        name: "Accurate transcription",
      }),
    ).toBeInTheDocument();
    expect(within(behaviorCard!).queryByText("Auto")).not.toBeInTheDocument();
    expect(within(behaviorCard!).queryByText("Streaming")).not.toBeInTheDocument();
    expect(within(behaviorCard!).queryByText("Standard")).not.toBeInTheDocument();

    await user.click(
      within(behaviorCard!).getByRole("radio", {
        name: "Accurate transcription",
      }),
    );

    await waitFor(() => {
      expect(providerApi.saveSystemSettings).toHaveBeenCalledWith({
        dictationMode: "standard",
        launchOnStartup: true,
        showSkippedTranscripts: false,
      });
    });
    expect(analyticsApi.analytics.capture).toHaveBeenCalledWith(
      "setting_changed",
      {
        setting_id: "dictation_mode",
        value: "standard",
      },
    );
  });

  it("saves a changed dictation shortcut from Settings", async () => {
    const user = userEvent.setup();
    renderApp(<SettingsPanel activeSection="keyboard-shortcut" />);

    const shortcutCard = (await screen.findByText("Keyboard shortcut")).closest(
      '[data-slot="card"]',
    ) as HTMLElement | null;
    expect(shortcutCard).not.toBeNull();

    await user.click(
      within(shortcutCard!).getByRole("button", { name: "Change shortcut" }),
    );
    await user.keyboard("{Control>}{Shift>}{/Shift}{/Control}");
    await user.click(
      within(shortcutCard!).getByRole("button", { name: "Save shortcut" }),
    );

    await waitFor(() => {
      expect(providerApi.saveDictationHotkey).toHaveBeenCalledWith("Ctrl+Shift");
    });
    expect(within(shortcutCard!).getByText("Ctrl")).toBeInTheDocument();
    expect(within(shortcutCard!).getByText("Shift")).toBeInTheDocument();
  });

  it("provides voice capsule restart, reset, and disable controls", async () => {
    providerApi.isTauriRuntime.mockReturnValue(true);
    const user = userEvent.setup();
    renderApp(<SettingsPanel activeSection="voice-capsule" />);

    const voiceCapsuleCard = (await screen.findByText("Voice capsule")).closest(
      '[data-slot="card"]',
    ) as HTMLElement | null;
    expect(voiceCapsuleCard).not.toBeNull();

    await waitFor(() => {
      expect(
        within(voiceCapsuleCard!).getByRole("switch", {
          name: "Show voice capsule",
        }),
      ).toBeChecked();
    });

    await user.click(
      within(voiceCapsuleCard!).getByRole("button", {
        name: "Restart capsule",
      }),
    );
    await waitFor(() => {
      expect(providerApi.restartVoiceCapsule).toHaveBeenCalled();
    });
    expect(
      await within(voiceCapsuleCard!).findByText("Voice capsule restarted."),
    ).toBeInTheDocument();

    await user.click(
      within(voiceCapsuleCard!).getByRole("button", {
        name: "Reset position",
      }),
    );
    await waitFor(() => {
      expect(providerApi.resetVoiceCapsulePosition).toHaveBeenCalled();
    });
    expect(
      await within(voiceCapsuleCard!).findByText("Voice capsule position reset."),
    ).toBeInTheDocument();

    await user.click(
      within(voiceCapsuleCard!).getByRole("switch", {
        name: "Show voice capsule",
      }),
    );
    await waitFor(() => {
      expect(providerApi.disableVoiceCapsule).toHaveBeenCalled();
    });
    expect(
      within(voiceCapsuleCard!).getByRole("switch", {
        name: "Show voice capsule",
      }),
    ).not.toBeChecked();
    expect(analyticsApi.analytics.capture).toHaveBeenCalledWith(
      "setting_changed",
      {
        enabled: false,
        setting_id: "voice_capsule_enabled",
      },
    );
  });

  it("validates first-time Azure setup locally before calling Tauri", async () => {
    providerApi.getProviderStatus.mockImplementation((providerId: string) => {
      if (providerId === "azure-openai") {
        return Promise.resolve({
          ...azureReadyStatus(),
          configured: false,
        });
      }
      return Promise.resolve(openAiNeedsKeyStatus());
    });
    const user = userEvent.setup();
    renderApp(<SettingsPanel />);

    await screen.findByRole("heading", { name: "Azure OpenAI" });
    await user.click(screen.getByRole("button", { name: "Save and use Azure OpenAI" }));

    expect(
      await screen.findByText(
        "Azure OpenAI API key is required before first use.",
      ),
    ).toBeInTheDocument();
    expect(providerApi.saveSpeechProviderSetup).not.toHaveBeenCalled();
  });

  it("saves Azure config without requiring the saved key to be re-entered", async () => {
    providerApi.saveSpeechProviderSetup.mockResolvedValue(azureReadyStatus());
    const user = userEvent.setup();
    renderApp(<SettingsPanel />);

    const deploymentIdInput = await screen.findByLabelText("Deployment ID");
    await waitFor(() => {
      expect(deploymentIdInput).toHaveValue("gpt-4o-transcribe");
    });
    await user.clear(deploymentIdInput);
    await user.type(deploymentIdInput, "new-deployment");
    await user.click(screen.getByRole("button", { name: "Save and use Azure OpenAI" }));

    await waitFor(() => {
      expect(providerApi.saveSpeechProviderSetup).toHaveBeenCalledWith({
        providerId: "azure-openai",
        apiKey: "",
        config: {
          endpoint: "https://example.openai.azure.com",
          deploymentId: "new-deployment",
          apiVersion: "2025-04-01-preview",
        },
        activate: true,
      });
    });
    expect(analyticsApi.analytics.capture).toHaveBeenCalledWith(
      "provider_configured",
      {
        provider_family: "azure",
        provider_id: "azure-openai",
        source: "settings",
      },
    );
  });

  it("tests only the selected Azure provider and shows a scoped success", async () => {
    const user = userEvent.setup();
    renderApp(<SettingsPanel />);

    await screen.findByRole("heading", { name: "Azure OpenAI" });
    await user.click(screen.getByRole("button", { name: "Test provider" }));

    await waitFor(() => {
      expect(providerApi.testSpeechProvider).toHaveBeenCalledWith(
        "azure-openai",
      );
    });
    expect(analyticsApi.analytics.capture).toHaveBeenCalledWith(
      "provider_test_started",
      {
        provider_id: "azure-openai",
        source: "settings",
      },
    );
    expect(analyticsApi.analytics.capture).toHaveBeenCalledWith(
      "provider_test_completed",
      {
        duration_bucket: expect.any(String),
        error_code: null,
        provider_id: "azure-openai",
        status: "success",
      },
    );
    expect(screen.getByText("Azure OpenAI provider is ready.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "OpenAI" })).not.toBeInTheDocument();
  });

  it("shows selected-provider test failures inside the active provider panel", async () => {
    providerApi.testSpeechProvider.mockRejectedValue({
      code: "missing_provider_config",
      message: "provider configuration is incomplete",
    });
    const user = userEvent.setup();
    renderApp(<SettingsPanel />);

    await screen.findByRole("heading", { name: "Azure OpenAI" });
    await user.click(screen.getByRole("button", { name: "Test provider" }));

    expect(
      await screen.findByText("Azure OpenAI configuration is incomplete."),
    ).toBeInTheDocument();
    expect(providerApi.testSpeechProvider).toHaveBeenCalledWith("azure-openai");
    expect(analyticsApi.analytics.capture).toHaveBeenCalledWith(
      "provider_test_completed",
      {
        duration_bucket: expect.any(String),
        error_code: "missing_provider_config",
        provider_id: "azure-openai",
        status: "failed",
      },
    );
    expect(analyticsApi.analytics.captureError).toHaveBeenCalledWith(
      {
        code: "missing_provider_config",
        message: "provider configuration is incomplete",
      },
      {
        code: "missing_provider_config",
        handled: true,
        providerId: "azure-openai",
        stage: "provider_configuration",
      },
    );
  });

  it("keeps diagnostics local and opens the log folder for manual sharing", async () => {
    providerApi.isTauriRuntime.mockReturnValue(true);
    const user = userEvent.setup();
    renderApp(<SettingsPanel activeSection="diagnostics" />);

    expect(
      await screen.findByText("Local logs are not sent automatically"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/attach the relevant logs to a GitHub issue or support thread/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open logs" }));

    await waitFor(() => {
      expect(providerApi.getDiagnosticsLocations).toHaveBeenCalled();
    });
    expect(openerApi.revealItemInDir).toHaveBeenCalledWith(
      "C:\\Users\\nikhi\\AppData\\Local\\ai.vaak.desktop\\logs",
    );
    expect(screen.getByText(/Log folder:/)).toBeInTheDocument();
  });
});
