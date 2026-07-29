import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderApp } from "@/test/render";

import { OnboardingModeChoice } from "./OnboardingModeChoice";

const analyticsState = vi.hoisted(() => ({
  analytics: {
    captureAppOpened: vi.fn(),
    errorTelemetryEnabled: false,
    setErrorTelemetryEnabled: vi.fn(),
    setUsageAnalyticsEnabled: vi.fn(),
    usageAnalyticsEnabled: false,
  },
}));

vi.mock("@/lib/analytics/browser", () => analyticsState);

describe("OnboardingModeChoice", () => {
  beforeEach(() => {
    analyticsState.analytics.errorTelemetryEnabled = false;
    analyticsState.analytics.usageAnalyticsEnabled = false;
    analyticsState.analytics.captureAppOpened.mockReset();
    analyticsState.analytics.setErrorTelemetryEnabled.mockReset();
    analyticsState.analytics.setUsageAnalyticsEnabled.mockReset();
  });

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

  it("offers explicit anonymous analytics consent without blocking local setup", async () => {
    const user = userEvent.setup();

    renderApp(
      <OnboardingModeChoice
        error={null}
        savingMode={null}
        onSelectMode={() => undefined}
      />,
    );

    const consent = screen.getByRole("switch", {
      name: "Share anonymous analytics and diagnostics",
    });
    expect(consent).not.toBeChecked();

    await user.click(consent);

    expect(analyticsState.analytics.setUsageAnalyticsEnabled).toHaveBeenCalledWith(
      true,
    );
    expect(analyticsState.analytics.setErrorTelemetryEnabled).toHaveBeenCalledWith(
      true,
    );
    expect(analyticsState.analytics.captureAppOpened).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "Continue locally" }),
    ).toBeEnabled();
  });
});
