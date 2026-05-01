import { describe, expect, it } from "vitest";

import {
  createTauriCommandHarness,
  expectTauriCommand,
} from "@/test/tauri";

import { getOnboardingState, saveOnboardingMode } from "./onboarding";

describe("onboarding Tauri API", () => {
  it("loads and saves first-run onboarding state through backend commands", async () => {
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

    await expect(getOnboardingState()).resolves.toMatchObject({
      completed: false,
      currentStep: "modeChoice",
      selectedMode: null,
    });
    await expect(saveOnboardingMode("local")).resolves.toMatchObject({
      currentStep: "desktopReadiness",
      selectedMode: "local",
    });

    expectTauriCommand(tauri, "get_onboarding_state", undefined);
    expectTauriCommand(tauri, "save_onboarding_mode", { mode: "local" });
  });
});
