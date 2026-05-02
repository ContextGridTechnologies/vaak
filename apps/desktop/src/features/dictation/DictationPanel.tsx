import { VoiceSetupPanel } from "@/features/onboarding";
import { useMicrophoneSelection } from "@/hooks/useMicrophoneSelection";
import { isTauriRuntime } from "@/lib/tauri";

export function DictationPanel() {
  const { hasPermission } = useMicrophoneSelection();

  return (
    <VoiceSetupPanel
      hasMicrophonePermission={hasPermission}
      tauriAvailable={isTauriRuntime()}
    />
  );
}
