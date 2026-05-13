import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderApp } from "@/test/render";

import { OnboardingLoadingScreen } from "./OnboardingLoadingScreen";

describe("OnboardingLoadingScreen", () => {
  it("uses the shared onboarding scroll region while setup state loads", () => {
    renderApp(<OnboardingLoadingScreen />);

    expect(screen.getByTestId("onboarding-scroll-region")).toHaveClass(
      "vaak-scroll-area",
      "min-h-0",
      "overflow-auto",
    );
    expect(screen.getByTestId("app-screen-content")).toBeInTheDocument();
  });
});
