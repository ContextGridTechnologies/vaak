import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderApp } from "@/test/render";

import { ProviderSetupStep } from "./ProviderSetupStep";

const speechProviderSettingsState = vi.hoisted(() => ({
  onVerifiedChange: null as null | ((verified: boolean) => void),
}));

vi.mock("@/features/settings/speech-provider", () => ({
  SpeechProviderSettings: ({
    onOnboardingVerifiedChange,
  }: {
    onOnboardingVerifiedChange?: (verified: boolean) => void;
  }) => {
    speechProviderSettingsState.onVerifiedChange = onOnboardingVerifiedChange ?? null;

    return (
      <div>
        <p>Mock provider settings</p>
        <button
          type="button"
          onClick={() => speechProviderSettingsState.onVerifiedChange?.(true)}
        >
          Mark provider verified
        </button>
      </div>
    );
  },
}));

describe("ProviderSetupStep", () => {
  it("shows Next only after the onboarding provider verification succeeds", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onContinue = vi.fn();

    renderApp(
      <ProviderSetupStep error={null} onBack={onBack} onContinue={onContinue} />,
    );

    expect(screen.getByTestId("provider-setup-card")).toContainElement(
      screen.getByText("Mock provider settings"),
    );
    expect(screen.queryByTestId("onboarding-split-layout")).not.toBeInTheDocument();
    expect(screen.queryByText("Voice capsule preview")).not.toBeInTheDocument();
    expect(screen.getByTestId("provider-setup-card-footer")).toContainElement(
      screen.getByRole("button", { name: "Back" }),
    );
    expect(screen.getByTestId("onboarding-scroll-region")).toContainElement(
      screen.getByText("Mock provider settings"),
    );
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mark provider verified" }));

    expect(
      await screen.findByRole("button", { name: "Next" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();
  });

  it("keeps setup errors inside the primary provider card", () => {
    renderApp(
      <ProviderSetupStep
        error="Unable to update setup step."
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    expect(screen.getByTestId("provider-setup-card")).toContainElement(
      screen.getByRole("alert"),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to update setup step.",
    );
  });
});
