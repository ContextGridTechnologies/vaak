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

    expect(openAi).toHaveAttribute("aria-pressed", "false");
    expect(assemblyAi).toHaveAttribute("aria-pressed", "false");
    expect(azureOpenAi).toHaveAttribute("aria-pressed", "true");
    expect(deepgram).toHaveAttribute("aria-pressed", "false");
    expect(elevenLabs).toHaveAttribute("aria-pressed", "false");
    expect(smallest).toHaveAttribute("aria-pressed", "false");
    expect(openAi).toHaveClass("min-h-9", "px-3", "py-2");
    expect(assemblyAi).toHaveClass("min-h-9", "px-3", "py-2");
    expect(azureOpenAi).toHaveClass(
      "min-h-9",
      "px-3",
      "py-2",
      "border-primary",
      "bg-primary/10",
    );
    expect(deepgram).toHaveClass("min-h-9", "px-3", "py-2");
    expect(elevenLabs).toHaveClass("min-h-9", "px-3", "py-2");
    expect(smallest).toHaveClass("min-h-9", "px-3", "py-2");
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
    expect(screen.getByText("Default provider: Azure OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Default provider: Azure OpenAI")).toHaveClass(
      "text-foreground",
    );

    await userEvent.click(openAi);

    expect(onSelectProvider).toHaveBeenCalledWith("openai");
  });
});
