import { invokeTauri } from "./runtime";

export type OnboardingMode = "local" | "sync" | "managed";

export type OnboardingStep = "modeChoice" | "desktopReadiness";

export type OnboardingState = {
  completed: boolean;
  currentStep: OnboardingStep;
  selectedMode: OnboardingMode | null;
};

export async function getOnboardingState(): Promise<OnboardingState> {
  return invokeTauri("get_onboarding_state");
}

export async function saveOnboardingMode(
  mode: OnboardingMode,
): Promise<OnboardingState> {
  return invokeTauri("save_onboarding_mode", { mode });
}
