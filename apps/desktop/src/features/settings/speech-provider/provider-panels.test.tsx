import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderApp } from "@/test/render";

import { AssemblyAiProviderPanel } from "./AssemblyAiProviderPanel";
import { AzureAiSpeechProviderPanel } from "./AzureAiSpeechProviderPanel";
import { AzureOpenAiProviderPanel } from "./AzureOpenAiProviderPanel";
import { ElevenLabsProviderPanel } from "./ElevenLabsProviderPanel";
import { OpenAiProviderPanel } from "./OpenAiProviderPanel";
import { SmallestProviderPanel } from "./SmallestProviderPanel";
import { ASSEMBLYAI_MODELS, SAVED_KEY_PLACEHOLDER } from "./types";

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

  it("shows a saved Azure AI Speech key as a non-copyable star placeholder", () => {
    renderApp(
      <AzureAiSpeechProviderPanel
        apiKey=""
        endpoint="https://example.cognitiveservices.azure.com"
        isLoading={false}
        isSaving={false}
        isTesting={false}
        status={{
          providerId: "azure-ai-speech",
          configured: true,
          configComplete: true,
        }}
        onApiKeyChange={vi.fn()}
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
    expect(screen.getByRole("combobox", { name: "Model" })).toBeInTheDocument();
  });

  it("keeps the AssemblyAI model picker focused on dictation models", () => {
    expect(ASSEMBLYAI_MODELS.map((model) => model.value)).toEqual([
      "universal-3-5-pro",
      "universal-3-pro",
      "u3-rt-pro",
    ]);
    expect(ASSEMBLYAI_MODELS.map((model) => Object.keys(model))).toEqual([
      ["value", "label"],
      ["value", "label"],
      ["value", "label"],
    ]);
    expect(ASSEMBLYAI_MODELS.map((model) => model.label)).toContain(
      "Universal-3 Realtime Pro",
    );

    renderApp(
      <AssemblyAiProviderPanel
        apiKey=""
        isLoading={false}
        isSaving={false}
        isTesting={false}
        model="universal-3-5-pro"
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

    expect(screen.getByRole("combobox", { name: "Model" })).toHaveTextContent(
      "Universal-3.5 Pro",
    );
  });

  it("shows a saved Smallest AI key as a non-copyable star placeholder", () => {
    renderApp(
      <SmallestProviderPanel
        apiKey=""
        isLoading={false}
        isSaving={false}
        isTesting={false}
        model="pulse"
        testResult={undefined}
        status={{
          providerId: "smallest",
          configured: true,
          configComplete: true,
        }}
        onApiKeyChange={vi.fn()}
        onModelChange={vi.fn()}
        onSubmit={vi.fn()}
        onTest={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Smallest AI API key");

    expect(input).toHaveAttribute("placeholder", SAVED_KEY_PLACEHOLDER);
    expect(input).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveTextContent("Pulse");
  });
});
