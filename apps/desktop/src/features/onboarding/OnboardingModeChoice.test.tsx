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

  it("renders the shared onboarding progress header for step one", () => {
    renderApp(
      <OnboardingModeChoice
        error={null}
        savingMode={null}
        onSelectMode={() => undefined}
      />,
    );

    expect(screen.getByText("VAAK SETUP")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Choose how to use Vaak" }),
    ).toBeInTheDocument();
  });
});
