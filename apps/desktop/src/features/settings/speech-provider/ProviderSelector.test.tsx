import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderApp } from "@/test/render";

import { ProviderSelector } from "./ProviderSelector";

describe("ProviderSelector", () => {
  it("renders providers as compact text-only selectable buttons instead of a dropdown", async () => {
    const onSelectProvider = vi.fn();

    renderApp(
      <ProviderSelector
        selectedProviderId="azure-openai"
        onSelectProvider={onSelectProvider}
      />,
    );

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    const openAi = screen.getByRole("button", { name: "OpenAI" });
    const assemblyAi = screen.getByRole("button", { name: "AssemblyAI" });
    const azureOpenAi = screen.getByRole("button", { name: "Azure OpenAI" });
    const deepgram = screen.getByRole("button", { name: "Deepgram" });
    const elevenLabs = screen.getByRole("button", { name: "ElevenLabs" });
    const smallest = screen.getByRole("button", { name: "Smallest AI" });

    expect(
      screen.getByText("Select the transcription service used for dictation."),
    ).toBeInTheDocument();
    expect(openAi).toHaveAttribute("aria-pressed", "false");
    expect(assemblyAi).toHaveAttribute("aria-pressed", "false");
    expect(azureOpenAi).toHaveAttribute("aria-pressed", "true");
    expect(deepgram).toHaveAttribute("aria-pressed", "false");
    expect(elevenLabs).toHaveAttribute("aria-pressed", "false");
    expect(smallest).toHaveAttribute("aria-pressed", "false");
    expect(openAi).toHaveClass("min-h-12", "px-4", "py-2", "shadow-none");
    expect(assemblyAi).toHaveClass(
      "min-h-12",
      "px-4",
      "py-2",
      "shadow-none",
    );
    expect(azureOpenAi).toHaveClass(
      "min-h-12",
      "px-4",
      "py-2",
      "border-primary",
      "bg-primary/10",
      "shadow-none",
    );
    expect(deepgram).toHaveClass("min-h-12", "px-4", "py-2", "shadow-none");
    expect(elevenLabs).toHaveClass(
      "min-h-12",
      "px-4",
      "py-2",
      "shadow-none",
    );
    expect(smallest).toHaveClass("min-h-12", "px-4", "py-2", "shadow-none");
    expect(openAi.querySelector("svg")).not.toBeInTheDocument();
    expect(assemblyAi.querySelector("svg")).not.toBeInTheDocument();
    expect(azureOpenAi.querySelector("svg")).not.toBeInTheDocument();
    expect(deepgram.querySelector("svg")).not.toBeInTheDocument();
    expect(elevenLabs.querySelector("svg")).not.toBeInTheDocument();
    expect(smallest.querySelector("svg")).not.toBeInTheDocument();
    expect(azureOpenAi).toHaveTextContent("Azure OpenAI");
    expect(azureOpenAi).not.toHaveTextContent("Default");
    expect(openAi).not.toHaveTextContent("Default");
    expect(assemblyAi).not.toHaveTextContent("Default");
    expect(
      screen.queryByText("Default provider: Azure OpenAI"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Vaak uses this provider for dictation. Saving a provider activates it.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/floating voice capsule/i)).not.toBeInTheDocument();

    await userEvent.click(openAi);

    expect(onSelectProvider).toHaveBeenCalledWith("openai");
  });
});
