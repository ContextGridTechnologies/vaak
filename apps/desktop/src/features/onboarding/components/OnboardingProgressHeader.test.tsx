import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderApp } from "@/test/render";

import { OnboardingProgressHeader } from "./OnboardingProgressHeader";

describe("OnboardingProgressHeader", () => {
  it("renders the shared setup heading, step label, and progress segments", () => {
    renderApp(
      <OnboardingProgressHeader
        step={1}
        totalSteps={5}
        title="Choose how to use Vaak"
        description="Set up desktop dictation without changing how you work."
      />,
    );

    expect(screen.getByText("VAAK SETUP")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Choose how to use Vaak" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Set up desktop dictation without changing how you work."),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("onboarding-progress-segment")).toHaveLength(5);
  });
});
