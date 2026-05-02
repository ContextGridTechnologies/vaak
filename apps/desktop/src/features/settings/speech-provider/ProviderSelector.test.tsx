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
    const elevenLabs = screen.getByRole("button", { name: "ElevenLabs" });

    expect(openAi).toHaveAttribute("aria-pressed", "false");
    expect(assemblyAi).toHaveAttribute("aria-pressed", "false");
    expect(azureOpenAi).toHaveAttribute("aria-pressed", "true");
    expect(elevenLabs).toHaveAttribute("aria-pressed", "false");
    expect(openAi).toHaveClass("min-h-9", "px-3", "py-2");
    expect(assemblyAi).toHaveClass("min-h-9", "px-3", "py-2");
    expect(azureOpenAi).toHaveClass("min-h-9", "px-3", "py-2");
    expect(elevenLabs).toHaveClass("min-h-9", "px-3", "py-2");
    expect(openAi.querySelector("svg")).not.toBeInTheDocument();
    expect(assemblyAi.querySelector("svg")).not.toBeInTheDocument();
    expect(azureOpenAi.querySelector("svg")).not.toBeInTheDocument();
    expect(elevenLabs.querySelector("svg")).not.toBeInTheDocument();

    await userEvent.click(openAi);

    expect(onSelectProvider).toHaveBeenCalledWith("openai");
  });
});
