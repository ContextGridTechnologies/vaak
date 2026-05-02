import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderApp } from "@/test/render";

import { AzureOpenAiProviderPanel } from "./AzureOpenAiProviderPanel";
import { OpenAiProviderPanel } from "./OpenAiProviderPanel";
import { SAVED_KEY_PLACEHOLDER } from "./types";

describe("speech provider panels", () => {
  it("shows a saved OpenAI key as a non-copyable star placeholder", () => {
    renderApp(
      <OpenAiProviderPanel
        apiKey=""
        isLoading={false}
        isSaving={false}
        isTesting={false}
        status={{
          providerId: "openai",
          configured: true,
          configComplete: true,
        }}
        onApiKeyChange={vi.fn()}
        onSubmit={vi.fn()}
        onTest={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("API key");

    expect(input).toHaveAttribute("placeholder", SAVED_KEY_PLACEHOLDER);
    expect(input).toHaveValue("");
  });

  it("shows a saved Azure OpenAI key as a non-copyable star placeholder", () => {
    renderApp(
      <AzureOpenAiProviderPanel
        apiKey=""
        apiVersion="2025-04-01-preview"
        deploymentId="gpt-4o-transcribe"
        endpoint="https://example.openai.azure.com"
        hasSavedKey
        isLoading={false}
        isSaving={false}
        isTesting={false}
        onApiKeyChange={vi.fn()}
        onApiVersionChange={vi.fn()}
        onDeploymentIdChange={vi.fn()}
        onEndpointChange={vi.fn()}
        onSubmit={vi.fn()}
        onTest={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("API key");

    expect(input).toHaveAttribute("placeholder", SAVED_KEY_PLACEHOLDER);
    expect(input).toHaveValue("");
  });
});
