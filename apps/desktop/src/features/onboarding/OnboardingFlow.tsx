import { useCallback, useEffect, useState, type ReactNode } from "react";
import { RefreshCwIcon } from "lucide-react";

import { PermissionCallout } from "@/components/app";
import { Button } from "@/components/ui/button";
import { analytics } from "@/lib/analytics/browser";
import {
  completeOnboarding,
  getOnboardingState,
  isTauriRuntime,
  recordStartupCheckpoint,
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
import { OnboardingShell } from "./components/OnboardingShell";

type OnboardingGateProps = {
  children: ReactNode;
};

export function OnboardingGate({ children }: OnboardingGateProps) {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(() => isTauriRuntime());
  const [error, setError] = useState<string | null>(null);
  const [savingMode, setSavingMode] = useState<OnboardingMode | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (!isTauriRuntime()) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    void recordStartupCheckpoint({
      windowLabel: "main",
      checkpoint: "onboarding_state_requested",
    }).catch(() => {});
    getOnboardingState()
      .then((loadedState) => {
        if (active) {
          void recordStartupCheckpoint({
            windowLabel: "main",
            checkpoint: "onboarding_state_loaded",
            detail: onboardingCheckpointDetail(loadedState),
          }).catch(() => {});
          setState(loadedState);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          const message =
            err instanceof Error ? err.message : "Unable to load setup state.";
          void recordStartupCheckpoint({
            windowLabel: "main",
            checkpoint: "onboarding_state_failed",
            detail: message,
          }).catch(() => {});
          setError(message);
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
  }, [loadAttempt]);

  const handleSetupRetry = useCallback(() => {
    setError(null);
    setLoading(true);
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

  async function handleModeSelect(mode: OnboardingMode) {
    setSavingMode(mode);
    setError(null);

    try {
      const savedState = await saveOnboardingMode(mode);
      setState(savedState);
      analytics.capture("onboarding_started", {
        entry_point: "first_run",
        mode,
      });
    } catch (err) {
      analytics.capture("onboarding_failed", {
        error_code: "settings_save_failed",
        error_stage: "mode_choice",
      });
      analytics.captureError(err, {
        code: "settings_save_failed",
        handled: true,
        stage: "onboarding",
      });
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
      analytics.capture("onboarding_failed", {
        error_code: "settings_save_failed",
        error_stage: "step_change",
      });
      analytics.captureError(err, {
        code: "settings_save_failed",
        handled: true,
        stage: "onboarding",
      });
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
      analytics.capture("onboarding_completed", {
        mode: savedState.selectedMode ?? "local",
      });
    } catch (err) {
      analytics.capture("onboarding_failed", {
        error_code: "settings_save_failed",
        error_stage: "completion",
      });
      analytics.captureError(err, {
        code: "settings_save_failed",
        handled: true,
        stage: "onboarding",
      });
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

  if (!state && error) {
    return <OnboardingLoadError error={error} onRetry={handleSetupRetry} />;
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

function onboardingCheckpointDetail(state: OnboardingState): string {
  if (state.completed) {
    return "completed";
  }

  return `incomplete:${state.currentStep}`;
}

function OnboardingLoadError({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <OnboardingShell
      header={
        <header className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Vaak setup
          </p>
          <div className="flex flex-col gap-2">
            <h1 className="text-balance text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
              Setup needs attention
            </h1>
            <p className="mx-auto max-w-xl text-balance text-sm text-muted-foreground sm:text-[0.95rem]">
              Vaak could not confirm your saved setup state.
            </p>
          </div>
        </header>
      }
    >
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <PermissionCallout
          tone="error"
          title="Unable to load setup state"
          action={
            <Button type="button" variant="outline" onClick={onRetry}>
              <RefreshCwIcon aria-hidden="true" />
              Retry
            </Button>
          }
        >
          {error}
        </PermissionCallout>
      </div>
    </OnboardingShell>
  );
}
