import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderApp } from "@/test/render";

import { OnboardingModeChoice } from "./OnboardingModeChoice";

describe("OnboardingModeChoice", () => {
  it("uses the compact onboarding shell spacing", () => {
    renderApp(
      <OnboardingModeChoice
        error={null}
        savingMode={null}
        onSelectMode={() => undefined}
      />,
    );

    expect(screen.getByTestId("app-screen-content")).toHaveClass(
      "max-w-[64rem]",
      "gap-6",
      "px-4",
      "py-10",
    );
  });

  it("uses a fit-based mode card grid instead of display-scale breakpoints", () => {
    const { container } = renderApp(
      <OnboardingModeChoice
        error={null}
        savingMode={null}
        onSelectMode={() => undefined}
      />,
    );

    const grid = container.querySelector("section");

    expect(grid).toHaveClass(
      "mx-auto",
      "w-full",
      "max-w-[56rem]",
      "justify-center",
      "grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),23.75rem))]",
    );
    expect(grid).not.toHaveClass("md:grid-cols-3");
    expect(grid).not.toHaveClass("md:grid-cols-2");
    expect(grid).not.toHaveClass("lg:grid-cols-2");
  });

  it("renders the shared onboarding progress header for step one", () => {
    renderApp(
      <OnboardingModeChoice
        error={null}
        savingMode={null}
        onSelectMode={() => undefined}
      />,
    );

    expect(screen.getByText("VAAK SETUP")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Choose how to use Vaak" }),
    ).toBeInTheDocument();
  });
});
