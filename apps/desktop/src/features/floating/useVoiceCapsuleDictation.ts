import { useEffect, useState } from "react";

import { rendererInstanceIdForCurrentLoad } from "@/app/stability";
import { useDictationLoop } from "@/features/dictation/hooks/useDictationLoop";
import { useDictationSession } from "@/features/dictation/hooks/useDictationSession";
import {
  getOnboardingState,
  getVoiceCapsuleReadyChallenge,
  listenToTauriEvent,
  recordStartupCheckpoint,
  recordVoiceCapsuleReady,
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
          sendVoiceCapsuleReady(state.completed);
        }
      } catch {
        if (!disposed) {
          setSessionEnabled(false);
          sendVoiceCapsuleReady(false);
        }
      }
    };

    void loadOnboardingState();
    void listenToTauriEvent<OnboardingState>(
      ONBOARDING_COMPLETED_EVENT,
      (event) => {
        setSessionEnabled(event.payload.completed);
        sendVoiceCapsuleReady(event.payload.completed);
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

function sendVoiceCapsuleReady(sessionEnabled: boolean) {
  void (async () => {
    const rendererInstanceId = rendererInstanceIdForCurrentLoad();
    try {
      await sendVoiceCapsuleReadyOnce(sessionEnabled, rendererInstanceId);
    } catch (error) {
      const category = readyAckFailureCategory(error);
      await recordVoiceCapsuleReadyFailure(category);
      if (category !== "stale_challenge") {
        return;
      }
      try {
        await sendVoiceCapsuleReadyOnce(sessionEnabled, rendererInstanceId);
      } catch {
        await recordVoiceCapsuleReadyFailure("retry_failed");
      }
    }
  })().catch(() => {});
}

async function sendVoiceCapsuleReadyOnce(
  sessionEnabled: boolean,
  rendererInstanceId: string,
) {
  const challenge = await getVoiceCapsuleReadyChallenge(rendererInstanceId);
  await recordVoiceCapsuleReady({
    ...challenge,
    rendererInstanceId,
    sessionEnabled,
  });
}

async function recordVoiceCapsuleReadyFailure(category: string) {
  await recordStartupCheckpoint({
    windowLabel: "voice-capsule",
    checkpoint: "voice_capsule_ready_ack_send_failed",
    detail: `category=${category}`,
  }).catch(() => {});
}

function readyAckFailureCategory(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("stale_attempt") || message.includes("bad_nonce")) {
    return "stale_challenge";
  }
  return "send_failed";
}
