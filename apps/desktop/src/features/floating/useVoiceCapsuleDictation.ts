import { useEffect, useState } from "react";

import { useDictationLoop } from "@/features/dictation/hooks/useDictationLoop";
import { useDictationSession } from "@/features/dictation/hooks/useDictationSession";
import {
  getOnboardingState,
  listenToTauriEvent,
  type OnboardingState,
} from "@/lib/tauri";

const ONBOARDING_COMPLETED_EVENT = "vaak://onboarding-completed";

export function useVoiceCapsuleDictation() {
  const [sessionEnabled, setSessionEnabled] = useState(false);
  const session = useDictationSession({ enabled: sessionEnabled });
  const dictation = useDictationLoop(session);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    const loadOnboardingState = async () => {
      try {
        const state = await getOnboardingState();
        if (!disposed) {
          setSessionEnabled(state.completed);
        }
      } catch {
        if (!disposed) {
          setSessionEnabled(false);
        }
      }
    };

    void loadOnboardingState();
    void listenToTauriEvent<OnboardingState>(
      ONBOARDING_COMPLETED_EVENT,
      (event) => {
        setSessionEnabled(event.payload.completed);
      },
    ).then((detach) => {
      if (disposed) {
        detach();
        return;
      }
      unlisten = detach;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return {
    dictation,
    session,
  };
}
