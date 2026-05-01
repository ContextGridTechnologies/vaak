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
});
