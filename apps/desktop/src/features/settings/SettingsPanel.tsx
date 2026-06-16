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
import {
  defaultSettingsSection,
  settingsSections,
  type SettingsSectionId,
} from "./settingsNavigation";

type SettingsPanelProps = {
  activeSection?: SettingsSectionId;
};

export function SettingsPanel({ activeSection }: SettingsPanelProps = {}) {
  const settingsNavigation = useSettingsNavigation();
  const selectedSection = activeSection ?? settingsNavigation.activeSection;
  const selectedSectionConfig =
    settingsSections.find((section) => section.value === selectedSection) ??
    settingsSections.find((section) => section.value === defaultSettingsSection);

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
          "max-w-[78rem] gap-4",
        )}
      >
        <section
          data-testid="settings-screen-shell"
          className="mx-0 flex w-full max-w-[64rem] flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              {selectedSectionConfig?.label ?? "Speech provider"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {selectedSectionConfig?.description ??
                "Choose the transcription provider Vaak uses for dictation."}
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
