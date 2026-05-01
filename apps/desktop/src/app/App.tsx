import { PermissionCallout } from "@/components/app";
import { AppLayout } from "./AppLayout";
import { DesktopTitleBar } from "./DesktopTitleBar";
import { AppProviders } from "./AppProviders";
import { TabsContent } from "@/components/ui/tabs";
import { isTauriRuntime } from "../lib/tauri";
import { CommandModePanel } from "../features/command-mode";
import { DiagnosticsPanel } from "../features/diagnostics";
import { DictationPanel } from "../features/dictation";
import { OnboardingGate } from "../features/onboarding";
import { SettingsPanel } from "../features/settings";
import "../styles/globals.css";

function App() {
  const tauriAvailable = isTauriRuntime();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <DesktopTitleBar />
      <div className="min-h-0 flex-1">
        <AppProviders>
          <OnboardingGate>
            <AppLayout
              notice={
                !tauriAvailable ? (
                  <PermissionCallout>
                    Browser preview mode. Native focus and text insertion
                    require `npm run tauri dev`.
                  </PermissionCallout>
                ) : null
              }
            >
              <TabsContent value="dictation" className="flex flex-col gap-4">
                <DictationPanel />
              </TabsContent>

              <TabsContent value="command-mode" className="flex flex-col gap-4">
                <CommandModePanel />
              </TabsContent>

              <TabsContent value="settings" className="flex flex-col gap-4">
                <SettingsPanel />
              </TabsContent>

              <TabsContent value="diagnostics">
                <DiagnosticsPanel tauriAvailable={tauriAvailable} />
              </TabsContent>
            </AppLayout>
          </OnboardingGate>
        </AppProviders>
      </div>
    </div>
  );
}

export default App;
