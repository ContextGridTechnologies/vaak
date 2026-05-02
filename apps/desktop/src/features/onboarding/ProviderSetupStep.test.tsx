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

    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mark provider verified" }));

    expect(
      await screen.findByRole("button", { name: "Next" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();
  });
});
