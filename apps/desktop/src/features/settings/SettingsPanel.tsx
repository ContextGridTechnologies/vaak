import { useEffect, useState } from "react";

import { appScreenContentClassName } from "@/components/app";
import { analytics } from "@/lib/analytics/browser";
import { cn } from "@/lib/utils";

import { KeyboardShortcutSettingsCard } from "./KeyboardShortcutSettingsCard";
import { MicrophoneSettingsCard } from "./MicrophoneSettingsCard";
import { SpeechProviderSettings } from "./speech-provider";
import { SystemSettingsCard } from "./SystemSettingsCard";
import { DiagnosticsSettingsCard } from "./DiagnosticsSettingsCard";
import { VoiceCapsuleSettingsCard } from "./VoiceCapsuleSettingsCard";
import { useSettingsNavigation } from "./SettingsNavigationContext";
import {
  allSettingsSections,
  defaultSettingsSection,
  type SettingsSectionId,
} from "./settingsNavigation";

type SettingsPanelProps = {
  activeSection?: SettingsSectionId | "transcription-mode";
};

export function SettingsPanel({ activeSection }: SettingsPanelProps = {}) {
  const settingsNavigation = useSettingsNavigation();
  const selectedSection = normalizeSettingsSection(
    activeSection ?? settingsNavigation.activeSection,
  );
  const selectedSectionConfig =
    allSettingsSections.find((section) => section.value === selectedSection) ??
    allSettingsSections.find((section) => section.value === defaultSettingsSection);
  const [mountedSections, setMountedSections] = useState<ReadonlySet<SettingsSectionId>>(
    () => new Set([selectedSection]),
  );

  useEffect(() => {
    analytics.capture("settings_opened", {
      section: "settings",
    });
  }, []);

  useEffect(() => {
    setMountedSections((currentSections) => {
      if (currentSections.has(selectedSection)) {
        return currentSections;
      }

      return new Set([...currentSections, selectedSection]);
    });
  }, [selectedSection]);

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
          className="mx-0 flex w-full max-w-[58rem] flex-col gap-4"
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

          {allSettingsSections.map((section) =>
            mountedSections.has(section.value) ? (
              <section
                key={section.value}
                aria-hidden={section.value !== selectedSection}
                hidden={section.value !== selectedSection}
              >
                {renderSettingsSection(section.value)}
              </section>
            ) : null,
          )}
        </section>
      </main>
    </div>
  );
}

function normalizeSettingsSection(
  section: SettingsSectionId | "transcription-mode",
): SettingsSectionId {
  return section === "transcription-mode" ? defaultSettingsSection : section;
}

function renderSettingsSection(section: SettingsSectionId) {
  switch (section) {
    case "speech-provider":
      return <SpeechProviderSettings />;
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
