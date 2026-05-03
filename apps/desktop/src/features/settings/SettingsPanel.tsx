import { appScreenContentClassName } from "@/components/app";
import { cn } from "@/lib/utils";

import { SpeechProviderSettings } from "./speech-provider";

export function SettingsPanel() {
  return (
    <div className="min-h-full bg-background text-foreground">
      <main
        className={cn(
          appScreenContentClassName,
          "max-w-[74rem] gap-5 pt-[4.05rem] sm:pt-[5.0625rem] lg:pt-[6.075rem]",
        )}
      >
        <section
          data-testid="settings-screen-shell"
          className="mx-auto w-full max-w-[52rem]"
        >
          <SpeechProviderSettings />
        </section>
      </main>
    </div>
  );
}
