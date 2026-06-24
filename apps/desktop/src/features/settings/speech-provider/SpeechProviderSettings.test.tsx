import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { azureReadyStatus, openAiNeedsKeyStatus } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { selectComboboxOption } from "@/test/select";

import { SpeechProviderSettings } from "./SpeechProviderSettings";

const providerApi = vi.hoisted(() => ({
  getProviderStatus: vi.fn(),
  getProviderConfig: vi.fn(),
  getSelectedSpeechProvider: vi.fn(),
  saveSpeechProviderSetup: vi.fn(),
  testSpeechProvider: vi.fn(),
}));

vi.mock("@/lib/tauri", () => ({
  ...providerApi,
}));

describe("SpeechProviderSettings", () => {
  beforeAll(() => {
    if (!HTMLElement.prototype.hasPointerCapture) {
      HTMLElement.prototype.hasPointerCapture = () => false;
    }
    if (!HTMLElement.prototype.setPointerCapture) {
      HTMLElement.prototype.setPointerCapture = () => {};
    }
    if (!HTMLElement.prototype.releasePointerCapture) {
      HTMLElement.prototype.releasePointerCapture = () => {};
    }
    if (!HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = () => {};
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    providerApi.getProviderStatus.mockImplementation((providerId: string) => {
      if (providerId === "azure-openai") {
        return Promise.resolve({
          ...azureReadyStatus(),
          configured: false,
        });
      }

      if (providerId === "assemblyai") {
        return Promise.resolve({
          providerId: "assemblyai",
          configured: false,
          configComplete: true,
        });
      }

      if (providerId === "elevenlabs") {
        return Promise.resolve({
          providerId: "elevenlabs",
          configured: false,
          configComplete: true,
        });
      }

      if (providerId === "deepgram") {
        return Promise.resolve({
          providerId: "deepgram",
          configured: false,
          configComplete: true,
        });
      }

      if (providerId === "smallest") {
        return Promise.resolve({
          providerId: "smallest",
          configured: false,
          configComplete: true,
        });
      }

      return Promise.resolve(openAiNeedsKeyStatus());
    });
    providerApi.getProviderConfig.mockResolvedValue(null);
    providerApi.getSelectedSpeechProvider.mockResolvedValue("openai");
    providerApi.saveSpeechProviderSetup.mockResolvedValue({
      providerId: "openai",
      configured: true,
      configComplete: true,
    });
    providerApi.testSpeechProvider.mockResolvedValue({
      providerId: "openai",
      configured: true,
      configComplete: true,
    });
  });

  it("renders provider setup without the generic Settings heading in onboarding variant", async () => {
    renderApp(<SpeechProviderSettings variant="onboarding" />);

    const modelCombobox = await screen.findByRole("combobox", { name: "Model" });
    await waitFor(() => {
      expect(modelCombobox).toHaveTextContent("GPT-4o mini Transcribe");
    });
    expect(screen.getByRole("heading", { name: "OpenAI" })).toBeInTheDocument();
    expect(screen.getByText("Speech provider")).toBeInTheDocument();
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "OpenAI" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Azure OpenAI" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "AssemblyAI" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ElevenLabs" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deepgram" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Smallest AI" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Settings" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Needs key")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Test provider" }),
    ).not.toBeInTheDocument();
  });

  it("keeps provider input rows clean without helper text under fields", async () => {
    const user = userEvent.setup();
    renderApp(<SpeechProviderSettings variant="onboarding" />);

    expect(await screen.findByLabelText("API key")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Stored in the operating system keychain and used only for local transcription requests.",
      ),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Azure OpenAI" }));

    expect(screen.getByLabelText("Endpoint")).toBeInTheDocument();
    expect(screen.getByLabelText("API key")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Use the Azure OpenAI resource endpoint, not a deployment URL.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        /Stored locally in the operating system keychain\. Re-enter the key when changing Azure settings\./,
      ),
    ).not.toBeInTheDocument();
  });

  it("auto-verifies onboarding provider setup after save and reports success", async () => {
    const user = userEvent.setup();
    const verifyOnboardingProvider = vi.fn().mockResolvedValue({
      providerId: "openai",
      model: "gpt-4o-mini-transcribe",
      text: "He began a confused complaint against the wizard who had vanished behind the curtain on the left.",
      durationMs: 1800,
    });
    const onOnboardingVerifiedChange = vi.fn();

    renderApp(
      <SpeechProviderSettings
        variant="onboarding"
        onOnboardingVerifiedChange={onOnboardingVerifiedChange}
        verifyOnboardingProvider={verifyOnboardingProvider}
      />,
    );

    await user.type(await screen.findByLabelText("API key"), "sk-test");
    await user.click(screen.getByRole("button", { name: "Save and use OpenAI" }));

    await waitFor(() => {
      expect(providerApi.saveSpeechProviderSetup).toHaveBeenCalledWith({
        providerId: "openai",
        apiKey: "sk-test",
        config: { model: "gpt-4o-mini-transcribe" },
        activate: true,
      });
      expect(verifyOnboardingProvider).toHaveBeenCalledWith("openai");
    });
    expect(
      await screen.findByText("Provider test passed."),
    ).toBeInTheDocument();
    expect(screen.getByText("Provider ready")).toBeInTheDocument();
    expect(
      screen.getByText("OpenAI is ready for local dictation."),
    ).toBeInTheDocument();
    expect(onOnboardingVerifiedChange).toHaveBeenLastCalledWith(true);

    await user.type(screen.getByLabelText("API key"), "x");

    expect(screen.queryByText("Provider ready")).not.toBeInTheDocument();
    expect(onOnboardingVerifiedChange).toHaveBeenLastCalledWith(false);
  });

  it("loads and saves the configured OpenAI model", async () => {
    const user = userEvent.setup();
    providerApi.getProviderConfig.mockImplementation((providerId: string) => {
      if (providerId === "openai") {
        return Promise.resolve({ model: "gpt-4o-transcribe" });
      }

      return Promise.resolve(null);
    });

    renderApp(<SpeechProviderSettings variant="settings" />);

    const modelCombobox = await screen.findByRole("combobox", { name: "Model" });
    await waitFor(() => {
      expect(modelCombobox).toHaveTextContent("GPT-4o Transcribe");
    });
    expect(
      screen.getByText("Choose the transcription provider Vaak uses for dictation."),
    ).toBeInTheDocument();

    await selectComboboxOption(
      user,
      modelCombobox,
      "GPT-4o mini Transcribe",
    );
    await user.type(screen.getByLabelText("API key"), "sk-test");
    await user.click(screen.getByRole("button", { name: "Save and use OpenAI" }));

    await waitFor(() => {
      expect(providerApi.saveSpeechProviderSetup).toHaveBeenCalledWith({
        providerId: "openai",
        apiKey: "sk-test",
        config: { model: "gpt-4o-mini-transcribe" },
        activate: true,
      });
    });
  });

  it("saves ElevenLabs with only an API key and activates it", async () => {
    const user = userEvent.setup();
    providerApi.getProviderConfig.mockImplementation((providerId: string) => {
      if (providerId === "elevenlabs") {
        return Promise.resolve({ model: "scribe_v2" });
      }

      return Promise.resolve(null);
    });
    providerApi.saveSpeechProviderSetup.mockResolvedValue({
      providerId: "elevenlabs",
      configured: true,
      configComplete: true,
    });

    renderApp(<SpeechProviderSettings variant="settings" />);

    await user.click(await screen.findByRole("button", { name: "ElevenLabs" }));
    const modelCombobox = await screen.findByRole("combobox", { name: "Model" });
    await waitFor(() => {
      expect(modelCombobox).toHaveTextContent("Scribe v2");
    });
    await user.type(screen.getByLabelText("API key"), "el-test");
    await user.click(screen.getByRole("button", { name: "Save and use ElevenLabs" }));

    await waitFor(() => {
      expect(providerApi.saveSpeechProviderSetup).toHaveBeenCalledWith({
        providerId: "elevenlabs",
        apiKey: "el-test",
        config: { model: "scribe_v2" },
        activate: true,
      });
    });
  });

  it("loads, saves, and verifies AssemblyAI with its selected model", async () => {
    const user = userEvent.setup();
    const verifyOnboardingProvider = vi.fn().mockResolvedValue({
      providerId: "assemblyai",
      model: "universal-3-pro",
      text: "He began a confused complaint against the wizard who had vanished behind the curtain on the left.",
      durationMs: 1800,
    });
    providerApi.getProviderConfig.mockImplementation((providerId: string) => {
      if (providerId === "assemblyai") {
        return Promise.resolve({
          model: "universal-3-5-pro",
        });
      }

      return Promise.resolve(null);
    });
    providerApi.saveSpeechProviderSetup.mockResolvedValue({
      providerId: "assemblyai",
      configured: true,
      configComplete: true,
    });

    renderApp(
      <SpeechProviderSettings
        variant="onboarding"
        verifyOnboardingProvider={verifyOnboardingProvider}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "AssemblyAI" }));
    const modelCombobox = await screen.findByRole("combobox", { name: "Model" });
    await waitFor(() => {
      expect(modelCombobox).toHaveTextContent("Universal-3.5 Pro");
    });
    await selectComboboxOption(user, modelCombobox, "Universal-3 Pro");
    await user.type(screen.getByLabelText("API key"), "aa-test");
    await user.click(screen.getByRole("button", { name: "Save and use AssemblyAI" }));

    await waitFor(() => {
      expect(providerApi.saveSpeechProviderSetup).toHaveBeenCalledWith({
        providerId: "assemblyai",
        apiKey: "aa-test",
        config: {
          model: "universal-3-pro",
        },
        activate: true,
      });
      expect(verifyOnboardingProvider).toHaveBeenCalledWith("assemblyai");
    });
    expect(
      await screen.findByText("Provider test passed."),
    ).toBeInTheDocument();
  });

  it("saves Smallest AI with its selected model and scopes provider test errors to that panel", async () => {
    const user = userEvent.setup();
    providerApi.getProviderConfig.mockImplementation((providerId: string) => {
      if (providerId === "smallest") {
        return Promise.resolve({ model: "pulse" });
      }

      return Promise.resolve(null);
    });
    providerApi.saveSpeechProviderSetup.mockResolvedValue({
      providerId: "smallest",
      configured: true,
      configComplete: true,
    });
    providerApi.testSpeechProvider.mockRejectedValue(
      new Error("Smallest AI returned 401: invalid key"),
    );

    renderApp(<SpeechProviderSettings variant="settings" />);

    await user.click(await screen.findByRole("button", { name: "Smallest AI" }));
    expect(screen.getByRole("heading", { name: "Smallest AI" })).toBeInTheDocument();
    const modelCombobox = await screen.findByRole("combobox", { name: "Model" });
    expect(modelCombobox).toHaveTextContent("Pulse");
    await selectComboboxOption(user, modelCombobox, "Pulse Pro");
    await user.type(screen.getByLabelText("Smallest AI API key"), "sm-test");
    await user.click(screen.getByRole("button", { name: "Save and use Smallest AI" }));

    await waitFor(() => {
      expect(providerApi.saveSpeechProviderSetup).toHaveBeenCalledWith({
        providerId: "smallest",
        apiKey: "sm-test",
        config: { model: "pulse-pro" },
        activate: true,
      });
    });

    await user.click(screen.getByRole("button", { name: "Test provider" }));

    expect(
      await screen.findByText("Smallest AI returned 401: invalid key"),
    ).toBeInTheDocument();
    expect(screen.queryByText("OpenAI returned 401: invalid key")).not.toBeInTheDocument();
  });

  it("shows a retry action only after a provider test failure", async () => {
    const user = userEvent.setup();
    providerApi.testSpeechProvider
      .mockRejectedValueOnce({
        code: "provider_rate_limited",
        message: "Smallest AI returned 429 Too Many Requests",
        retryAfterMs: 5000,
      })
      .mockResolvedValueOnce({
        providerId: "smallest",
        configured: true,
        configComplete: true,
      });

    renderApp(<SpeechProviderSettings variant="settings" />);

    await user.click(await screen.findByRole("button", { name: "Smallest AI" }));
    expect(
      screen.queryByRole("button", { name: "Retry provider test" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Test provider" }));

    expect(
      await screen.findByText("Smallest AI is rate-limiting requests. Try again in 5 seconds."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry provider test" }));

    await waitFor(() => {
      expect(providerApi.testSpeechProvider).toHaveBeenCalledTimes(2);
    });
    expect(
      await screen.findByText("Smallest AI provider is ready."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Retry provider test" }),
    ).not.toBeInTheDocument();
  });

  it("saves and verifies Deepgram with Nova-3", async () => {
    const user = userEvent.setup();
    const verifyOnboardingProvider = vi.fn().mockResolvedValue({
      providerId: "deepgram",
      model: "nova-3",
      text: "He began a confused complaint against the wizard who had vanished behind the curtain on the left.",
      durationMs: 1800,
    });
    providerApi.saveSpeechProviderSetup.mockResolvedValue({
      providerId: "deepgram",
      configured: true,
      configComplete: true,
    });

    renderApp(
      <SpeechProviderSettings
        variant="onboarding"
        verifyOnboardingProvider={verifyOnboardingProvider}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Deepgram" }));
    expect(screen.getByText("Nova-3")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Model" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Deepgram API key"), "dg-test");
    await user.click(screen.getByRole("button", { name: "Save and use Deepgram" }));

    await waitFor(() => {
      expect(providerApi.saveSpeechProviderSetup).toHaveBeenCalledWith({
        providerId: "deepgram",
        apiKey: "dg-test",
        config: { model: "nova-3" },
        activate: true,
      });
      expect(verifyOnboardingProvider).toHaveBeenCalledWith("deepgram");
    });
    expect(
      await screen.findByText("Provider test passed."),
    ).toBeInTheDocument();
  });
});
