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
  getMicrophoneSelection: vi.fn(),
  saveMicrophoneSelection: vi.fn(),
  getHotkeyBindings: vi.fn(),
  saveDictationHotkey: vi.fn(),
}));

vi.mock("@/lib/tauri", () => ({
  ...providerApi,
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
    expect(
      screen.getByRole("heading", { name: "Settings" }).closest('[data-slot="card"]'),
    ).toBeNull();
    expect(
      screen.getByText("Providers, microphone, hotkey, and app preferences.").closest(
        '[data-slot="card"]',
      ),
    ).toBeNull();
    expect(screen.getByText("Speech provider").closest('[data-slot="card"]')).not.toBeNull();

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
  });

  it("shows microphone and shortcut settings as separate cards after provider setup", async () => {
    renderApp(<SettingsPanel />);

    expect(await screen.findByText("Speech provider")).toBeInTheDocument();

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

    const shortcutCard = screen
      .getByText("Change the hold-to-talk shortcut used by the voice capsule.")
      .closest('[data-slot="card"]') as HTMLElement | null;
    expect(shortcutCard).not.toBeNull();
    expect(within(shortcutCard!).getByText("Keyboard shortcut")).toBeInTheDocument();
    expect(within(shortcutCard!).getByText("Ctrl")).toBeInTheDocument();
    expect(within(shortcutCard!).getByText("Win")).toBeInTheDocument();
  });

  it("saves a changed dictation shortcut from Settings", async () => {
    const user = userEvent.setup();
    renderApp(<SettingsPanel />);

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
  });
});
