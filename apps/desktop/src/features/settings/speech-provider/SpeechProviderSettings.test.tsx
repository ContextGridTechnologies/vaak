import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { azureReadyStatus, openAiNeedsKeyStatus } from "@/test/fixtures";
import { renderApp } from "@/test/render";

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
  beforeEach(() => {
    vi.clearAllMocks();
    providerApi.getProviderStatus.mockImplementation((providerId: string) => {
      if (providerId === "azure-openai") {
        return Promise.resolve({
          ...azureReadyStatus(),
          configured: false,
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

    expect(
      await screen.findByRole("heading", { name: "OpenAI" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Speech provider")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "OpenAI" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Azure OpenAI" }),
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
        config: undefined,
        activate: true,
      });
      expect(verifyOnboardingProvider).toHaveBeenCalledWith("openai");
    });
    expect(
      await screen.findByText("Provider test passed."),
    ).toBeInTheDocument();
    expect(onOnboardingVerifiedChange).toHaveBeenLastCalledWith(true);
  });
});
