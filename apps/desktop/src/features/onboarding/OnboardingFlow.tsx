import { useEffect, useState, type ReactNode } from "react";

import {
  completeOnboarding,
  getOnboardingState,
  isTauriRuntime,
  saveOnboardingMode,
  saveOnboardingStep,
  type OnboardingMode,
  type OnboardingState,
} from "@/lib/tauri";

import { MicrophoneReadinessStep } from "./MicrophoneReadinessStep";
import { HotkeyReadinessStep } from "./HotkeyReadinessStep";
import { OnboardingLoadingScreen } from "./OnboardingLoadingScreen";
import { OnboardingModeChoice } from "./OnboardingModeChoice";
import { ProviderSetupStep } from "./ProviderSetupStep";

type OnboardingGateProps = {
  children: ReactNode;
};

export function OnboardingGate({ children }: OnboardingGateProps) {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(() => isTauriRuntime());
  const [error, setError] = useState<string | null>(null);
  const [savingMode, setSavingMode] = useState<OnboardingMode | null>(null);

  useEffect(() => {
    if (!isTauriRuntime()) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    getOnboardingState()
      .then((loadedState) => {
        if (active) {
          setState(loadedState);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Unable to load setup state.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleModeSelect(mode: OnboardingMode) {
    setSavingMode(mode);
    setError(null);

    try {
      const savedState = await saveOnboardingMode(mode);
      setState(savedState);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save setup mode.");
    } finally {
      setSavingMode(null);
    }
  }

  async function handleStepChange(step: OnboardingState["currentStep"]) {
    setError(null);

    try {
      const savedState = await saveOnboardingStep(step);
      setState(savedState);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update setup step.",
      );
    }
  }

  async function handleCompleteOnboarding() {
    setError(null);

    try {
      const savedState = await completeOnboarding();
      setState(savedState);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to finish setup.",
      );
    }
  }

  if (!isTauriRuntime()) {
    return children;
  }

  if (loading) {
    return <OnboardingLoadingScreen />;
  }

  if (state?.completed) {
    return children;
  }

  if (!state || state.currentStep === "modeChoice") {
    return (
      <OnboardingModeChoice
        error={error}
        savingMode={savingMode}
        onSelectMode={handleModeSelect}
      />
    );
  }

  if (state.currentStep === "microphoneReadiness") {
    return (
      <MicrophoneReadinessStep
        error={error}
        onBack={() => void handleStepChange("modeChoice")}
        onContinue={() => void handleStepChange("providerSetup")}
      />
    );
  }

  if (state.currentStep === "providerSetup") {
    return (
      <ProviderSetupStep
        error={error}
        onBack={() => void handleStepChange("microphoneReadiness")}
        onContinue={() => void handleStepChange("hotkeyReadiness")}
      />
    );
  }

  if (state.currentStep === "hotkeyReadiness") {
    return (
      <HotkeyReadinessStep
        error={error}
        onBack={() => void handleStepChange("providerSetup")}
        onContinue={() => void handleCompleteOnboarding()}
      />
    );
  }

  return (
    <OnboardingModeChoice
      error={error}
      savingMode={savingMode}
      onSelectMode={handleModeSelect}
    />
  );
}
