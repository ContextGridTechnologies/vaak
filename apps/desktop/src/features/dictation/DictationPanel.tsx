import { VoiceSetupPanel } from "@/features/onboarding";
import { useDictationSession } from "./hooks/useDictationSession";

export function DictationPanel() {
  const { hasPermission, tauriAvailable } = useDictationSession();

  return (
    <VoiceSetupPanel
      hasMicrophonePermission={hasPermission}
      tauriAvailable={tauriAvailable}
    />
  );
}
