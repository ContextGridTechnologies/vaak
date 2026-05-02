import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";
import { renderApp } from "@/test/render";

import { OnboardingActionBar } from "./OnboardingActionBar";

describe("OnboardingActionBar", () => {
  it("renders the shared primary and secondary actions", () => {
    renderApp(
      <OnboardingActionBar
        primaryAction={<Button type="button">Continue</Button>}
        secondaryAction={<Button type="button" variant="outline">Back</Button>}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Continue" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-action-bar")).toHaveClass(
      "flex",
      "justify-center",
    );
  });
});
