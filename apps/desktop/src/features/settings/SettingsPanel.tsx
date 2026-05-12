import { appScreenContentClassName } from "@/components/app";
import { cn } from "@/lib/utils";

import { KeyboardShortcutSettingsCard } from "./KeyboardShortcutSettingsCard";
import { MicrophoneSettingsCard } from "./MicrophoneSettingsCard";
import { SpeechProviderSettings } from "./speech-provider";
import { UsageAnalyticsSettingsCard } from "./UsageAnalyticsSettingsCard";

export function SettingsPanel() {
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
          <SpeechProviderSettings />
          <MicrophoneSettingsCard />
          <KeyboardShortcutSettingsCard />
          <UsageAnalyticsSettingsCard />
        </section>
      </main>
    </div>
  );
}
