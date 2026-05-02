import { describe, expect, it } from "vitest";

import {
  createTauriCommandHarness,
  expectTauriCommand,
} from "@/test/tauri";

import {
  completeOnboarding,
  getOnboardingState,
  getMicrophoneSelection,
  type OnboardingStep,
  saveOnboardingMode,
  saveMicrophoneSelection,
  saveOnboardingStep,
} from "./onboarding";

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
      currentStep: "microphoneReadiness",
      selectedMode: "local",
    });
    tauri.resolveCommand("save_onboarding_step", {
      completed: false,
      currentStep: "hotkeyReadiness",
      selectedMode: "local",
    });
    tauri.resolveCommand("complete_onboarding", {
      completed: true,
      currentStep: "hotkeyReadiness",
      selectedMode: "local",
    });

    await expect(getOnboardingState()).resolves.toMatchObject({
      completed: false,
      currentStep: "modeChoice",
      selectedMode: null,
    });
    await expect(saveOnboardingMode("local")).resolves.toMatchObject({
      currentStep: "microphoneReadiness",
      selectedMode: "local",
    });
    await expect(
      saveOnboardingStep("hotkeyReadiness" satisfies OnboardingStep),
    ).resolves.toMatchObject({
      currentStep: "hotkeyReadiness",
      selectedMode: "local",
    });
    await expect(completeOnboarding()).resolves.toMatchObject({
      completed: true,
      currentStep: "hotkeyReadiness",
      selectedMode: "local",
    });

    expectTauriCommand(tauri, "get_onboarding_state", undefined);
    expectTauriCommand(tauri, "save_onboarding_mode", { mode: "local" });
    expectTauriCommand(tauri, "save_onboarding_step", {
      step: "hotkeyReadiness",
    });
    expectTauriCommand(tauri, "complete_onboarding", undefined);
  });

  it("loads and saves microphone selection through backend commands", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_microphone_selection", { mode: "system" });
    tauri.resolveCommand("save_microphone_selection", {
      mode: "manual",
      deviceId: "usb-mic",
    });

    await expect(getMicrophoneSelection()).resolves.toEqual({ mode: "system" });
    await expect(
      saveMicrophoneSelection({ mode: "manual", deviceId: "usb-mic" }),
    ).resolves.toEqual({ mode: "manual", deviceId: "usb-mic" });

    expectTauriCommand(tauri, "get_microphone_selection", undefined);
    expectTauriCommand(tauri, "save_microphone_selection", {
      selection: { mode: "manual", deviceId: "usb-mic" },
    });
  });
});
