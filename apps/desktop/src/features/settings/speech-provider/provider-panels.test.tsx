import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderApp } from "@/test/render";

import { AssemblyAiProviderPanel } from "./AssemblyAiProviderPanel";
import { AzureOpenAiProviderPanel } from "./AzureOpenAiProviderPanel";
import { ElevenLabsProviderPanel } from "./ElevenLabsProviderPanel";
import { OpenAiProviderPanel } from "./OpenAiProviderPanel";
import { SmallestProviderPanel } from "./SmallestProviderPanel";
import { SAVED_KEY_PLACEHOLDER } from "./types";

describe("speech provider panels", () => {
  it("shows a saved OpenAI key as a non-copyable star placeholder", () => {
    renderApp(
      <OpenAiProviderPanel
        apiKey=""
        isLoading={false}
        isSaving={false}
        isTesting={false}
        model="gpt-4o-mini-transcribe"
        status={{
          providerId: "openai",
          configured: true,
          configComplete: true,
        }}
        onApiKeyChange={vi.fn()}
        onModelChange={vi.fn()}
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

  it("shows a saved ElevenLabs key as a non-copyable star placeholder", () => {
    renderApp(
      <ElevenLabsProviderPanel
        apiKey=""
        isLoading={false}
        isSaving={false}
        isTesting={false}
        model="scribe_v2"
        status={{
          providerId: "elevenlabs",
          configured: true,
          configComplete: true,
        }}
        onApiKeyChange={vi.fn()}
        onModelChange={vi.fn()}
        onSubmit={vi.fn()}
        onTest={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("API key");

    expect(input).toHaveAttribute("placeholder", SAVED_KEY_PLACEHOLDER);
    expect(input).toHaveValue("");
  });

  it("shows a saved AssemblyAI key as a non-copyable star placeholder", () => {
    renderApp(
      <AssemblyAiProviderPanel
        apiKey=""
        isLoading={false}
        isSaving={false}
        isTesting={false}
        model="universal-3-pro"
        status={{
          providerId: "assemblyai",
          configured: true,
          configComplete: true,
        }}
        onApiKeyChange={vi.fn()}
        onModelChange={vi.fn()}
        onSubmit={vi.fn()}
        onTest={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("API key");

    expect(input).toHaveAttribute("placeholder", SAVED_KEY_PLACEHOLDER);
    expect(input).toHaveValue("");
  });

  it("shows a saved Smallest AI key as a non-copyable star placeholder", () => {
    renderApp(
      <SmallestProviderPanel
        apiKey=""
        isLoading={false}
        isSaving={false}
        isTesting={false}
        testResult={undefined}
        status={{
          providerId: "smallest",
          configured: true,
          configComplete: true,
        }}
        onApiKeyChange={vi.fn()}
        onSubmit={vi.fn()}
        onTest={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Smallest AI API key");

    expect(input).toHaveAttribute("placeholder", SAVED_KEY_PLACEHOLDER);
    expect(input).toHaveValue("");
    expect(screen.queryByRole("combobox", { name: "Model" })).not.toBeInTheDocument();
  });
});
