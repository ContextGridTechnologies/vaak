import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderApp } from "@/test/render";

import { OnboardingShell } from "./OnboardingShell";

describe("OnboardingShell", () => {
  it("renders shared onboarding content and footer hint inside the centered shell", () => {
    renderApp(
      <OnboardingShell
        footerHint="You can change this later in Settings."
        header={
          <div data-testid="onboarding-shell-header">
            <h1>Header</h1>
          </div>
        }
      >
        <div>Shell body</div>
      </OnboardingShell>,
    );

    expect(screen.getByTestId("onboarding-shell-header")).toBeInTheDocument();
    expect(screen.getByText("Shell body")).toBeInTheDocument();
    expect(
      screen.getByText("You can change this later in Settings."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("app-screen-content")).toHaveClass(
      "max-w-[64rem]",
      "gap-6",
      "px-4",
      "py-10",
    );
  });
});
