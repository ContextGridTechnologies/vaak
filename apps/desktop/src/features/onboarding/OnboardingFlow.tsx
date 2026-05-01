import { useEffect, useState, type ReactNode } from "react";

import {
  getOnboardingState,
  isTauriRuntime,
  saveOnboardingMode,
  type OnboardingMode,
  type OnboardingState,
} from "@/lib/tauri";

import { OnboardingLoadingScreen } from "./OnboardingLoadingScreen";
import { OnboardingModeChoice } from "./OnboardingModeChoice";

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

  if (!isTauriRuntime()) {
    return children;
  }

  if (loading) {
    return <OnboardingLoadingScreen />;
  }

  if (state && (state.completed || state.currentStep !== "modeChoice")) {
    return children;
  }

  return (
    <OnboardingModeChoice
      error={error}
      savingMode={savingMode}
      onSelectMode={handleModeSelect}
    />
  );
}
