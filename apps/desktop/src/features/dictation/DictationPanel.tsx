import { VoiceSetupPanel } from "@/features/onboarding";
import { useAudioDevices } from "@/hooks/useAudioDevices";
import { isTauriRuntime } from "@/lib/tauri";

export function DictationPanel() {
  const { hasPermission } = useAudioDevices();

  return (
    <VoiceSetupPanel
      hasMicrophonePermission={hasPermission}
      tauriAvailable={isTauriRuntime()}
    />
  );
}
