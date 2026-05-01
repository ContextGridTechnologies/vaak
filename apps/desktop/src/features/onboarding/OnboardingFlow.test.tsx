import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { renderApp } from "@/test/render";
import {
  createTauriCommandHarness,
  expectTauriCommand,
} from "@/test/tauri";

import { OnboardingGate } from "./OnboardingFlow";

describe("OnboardingGate", () => {
  it("shows the first-run mode choice before the app shell when onboarding starts", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_onboarding_state", {
      completed: false,
      currentStep: "modeChoice",
      selectedMode: null,
    });

    renderApp(
      <OnboardingGate>
        <div>Voice app shell</div>
      </OnboardingGate>,
    );

    expect(
      await screen.findByRole("heading", { name: "Choose how Vaak starts" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Local setup")).toBeInTheDocument();
    expect(screen.getByText("Sign in for sync")).toBeInTheDocument();
    expect(screen.getByText("Managed Vaak")).toBeInTheDocument();
    expect(screen.getByTestId("app-screen-content")).toHaveClass("max-w-6xl");
    expect(screen.queryByText("Voice app shell")).not.toBeInTheDocument();

    expectTauriCommand(tauri, "get_onboarding_state", undefined);
  });

  it("persists local mode and enters the app shell", async () => {
    const user = userEvent.setup();
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_onboarding_state", {
      completed: false,
      currentStep: "modeChoice",
      selectedMode: null,
    });
    tauri.resolveCommand("save_onboarding_mode", {
      completed: false,
      currentStep: "desktopReadiness",
      selectedMode: "local",
    });

    renderApp(
      <OnboardingGate>
        <div>Voice app shell</div>
      </OnboardingGate>,
    );

    await user.click(
      await screen.findByRole("button", { name: "Continue locally" }),
    );

    await waitFor(() => {
      expect(screen.getByText("Voice app shell")).toBeInTheDocument();
    });
    expectTauriCommand(tauri, "save_onboarding_mode", { mode: "local" });
  });

  it("keeps setup visible when onboarding state cannot be loaded", async () => {
    const tauri = createTauriCommandHarness();
    tauri.rejectCommand("get_onboarding_state", new Error("settings failed"));

    renderApp(
      <OnboardingGate>
        <div>Voice app shell</div>
      </OnboardingGate>,
    );

    expect(await screen.findByText("settings failed")).toBeInTheDocument();
    expect(screen.queryByText("Voice app shell")).not.toBeInTheDocument();
  });
});
