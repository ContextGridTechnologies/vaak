import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { azureReadyStatus, openAiNeedsKeyStatus } from "@/test/fixtures";
import { renderApp } from "@/test/render";

import { SettingsPanel } from "./SettingsPanel";

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

describe("SettingsPanel provider setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("loads the active Azure provider without showing the OpenAI form", async () => {
    renderApp(<SettingsPanel />);

    expect(
      await screen.findByRole("heading", { name: "Azure OpenAI" }),
    ).toBeInTheDocument();

    expect(screen.queryByRole("heading", { name: "OpenAI" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Endpoint")).toHaveValue(
      "https://example.openai.azure.com",
    );
    expect(screen.getByLabelText("Deployment ID")).toHaveValue(
      "gpt-4o-transcribe",
    );
    expect(screen.getByLabelText("API version")).toHaveValue(
      "2025-04-01-preview",
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

    await screen.findByRole("heading", { name: "Azure OpenAI" });
    await user.clear(screen.getByLabelText("Deployment ID"));
    await user.type(screen.getByLabelText("Deployment ID"), "new-deployment");
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
