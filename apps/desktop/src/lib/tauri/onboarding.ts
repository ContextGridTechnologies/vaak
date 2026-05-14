import { invokeTauri } from "./runtime";

export type OnboardingMode = "local" | "sync" | "managed";

export type OnboardingStep =
  | "modeChoice"
  | "microphoneReadiness"
  | "providerSetup"
  | "hotkeyReadiness";

export type OnboardingState = {
  completed: boolean;
  currentStep: OnboardingStep;
  selectedMode: OnboardingMode | null;
};

export type MicrophoneSelection =
  | { mode: "system" }
  | { mode: "manual"; deviceId: string };

export const MICROPHONE_SELECTION_CHANGED_EVENT =
  "vaak://microphone-selection-changed";

export async function getOnboardingState(): Promise<OnboardingState> {
  return invokeTauri("get_onboarding_state");
}

export async function saveOnboardingMode(
  mode: OnboardingMode,
): Promise<OnboardingState> {
  return invokeTauri("save_onboarding_mode", { mode });
}

export async function saveOnboardingStep(
  step: OnboardingStep,
): Promise<OnboardingState> {
  return invokeTauri("save_onboarding_step", { step });
}

export async function completeOnboarding(): Promise<OnboardingState> {
  return invokeTauri("complete_onboarding");
}

export async function getMicrophoneSelection(): Promise<MicrophoneSelection> {
  return invokeTauri("get_microphone_selection");
}

export async function saveMicrophoneSelection(
  selection: MicrophoneSelection,
): Promise<MicrophoneSelection> {
  return invokeTauri("save_microphone_selection", { selection });
}
