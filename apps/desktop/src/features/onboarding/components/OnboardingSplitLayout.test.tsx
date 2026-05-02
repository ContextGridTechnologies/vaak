import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderApp } from "@/test/render";

import { OnboardingSplitLayout } from "./OnboardingSplitLayout";

describe("OnboardingSplitLayout", () => {
  it("renders main and aside content in the shared onboarding split layout", () => {
    renderApp(
      <OnboardingSplitLayout
        main={<div>Main panel</div>}
        aside={<div>Aside preview</div>}
      />,
    );

    expect(screen.getByText("Main panel")).toBeInTheDocument();
    expect(screen.getByText("Aside preview")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-split-layout")).toHaveClass(
      "grid",
      "gap-6",
    );
  });
});
