import { useEffect } from "react";

import { appScreenContentClassName } from "@/components/app";
import { analytics } from "@/lib/analytics/browser";
import { cn } from "@/lib/utils";

import { KeyboardShortcutSettingsCard } from "./KeyboardShortcutSettingsCard";
import { MicrophoneSettingsCard } from "./MicrophoneSettingsCard";
import { SpeechProviderSettings } from "./speech-provider";
import { SystemSettingsCard } from "./SystemSettingsCard";
import { DiagnosticsSettingsCard } from "./DiagnosticsSettingsCard";
import { DictationBehaviorSettingsCard } from "./DictationBehaviorSettingsCard";
import { VoiceCapsuleSettingsCard } from "./VoiceCapsuleSettingsCard";
import { useSettingsNavigation } from "./SettingsNavigationContext";
import { type SettingsSectionId } from "./settingsNavigation";

type SettingsPanelProps = {
  activeSection?: SettingsSectionId;
};

export function SettingsPanel({ activeSection }: SettingsPanelProps = {}) {
  const settingsNavigation = useSettingsNavigation();
  const selectedSection = activeSection ?? settingsNavigation.activeSection;
  useEffect(() => {
    analytics.capture("settings_opened", {
      section: "settings",
    });
  }, []);

  return (
    <div className="min-h-full bg-background text-foreground">
      <main
        className={cn(
          appScreenContentClassName,
          "max-w-[74rem] gap-5",
        )}
      >
        <section
          data-testid="settings-screen-shell"
          className="mx-auto flex w-full max-w-[52rem] flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Settings
            </h2>
            <p className="text-sm text-muted-foreground">
              Providers, microphone, hotkey, and app preferences.
            </p>
          </div>

          {renderSettingsSection(selectedSection)}
        </section>
      </main>
    </div>
  );
}

function renderSettingsSection(section: SettingsSectionId) {
  switch (section) {
    case "speech-provider":
      return <SpeechProviderSettings />;
    case "transcription-mode":
      return <DictationBehaviorSettingsCard />;
    case "microphone":
      return <MicrophoneSettingsCard />;
    case "keyboard-shortcut":
      return <KeyboardShortcutSettingsCard />;
    case "voice-capsule":
      return <VoiceCapsuleSettingsCard />;
    case "system":
      return <SystemSettingsCard />;
    case "diagnostics":
      return <DiagnosticsSettingsCard />;
    default:
      return <SpeechProviderSettings />;
  }
}
