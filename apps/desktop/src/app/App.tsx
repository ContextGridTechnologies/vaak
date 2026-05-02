import type { CSSProperties } from "react";

import { PermissionCallout } from "@/components/app";
import { TabsContent } from "@/components/ui/tabs";
import { AppLayout } from "./AppLayout";
import { DesktopTitleBar } from "./DesktopTitleBar";
import { AppProviders } from "./AppProviders";
import { isTauriRuntime } from "../lib/tauri";
import { AccountPanel } from "../features/account";
import { HomePanel } from "../features/home";
import { OnboardingGate } from "../features/onboarding";
import { SettingsPanel } from "../features/settings";
import "../styles/globals.css";

function App() {
  const tauriAvailable = isTauriRuntime();

  return (
    <div
      className="flex min-h-screen flex-col bg-background text-foreground"
      style={
        {
          "--vaak-titlebar-height": tauriAvailable ? "2.5rem" : "0px",
        } as CSSProperties
      }
    >
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
              <TabsContent value="home" className="flex flex-col">
                <HomePanel />
              </TabsContent>

              <TabsContent value="settings" className="flex flex-col gap-4">
                <SettingsPanel />
              </TabsContent>

              <TabsContent value="account" className="flex flex-col gap-4">
                <AccountPanel />
              </TabsContent>
            </AppLayout>
          </OnboardingGate>
        </AppProviders>
      </div>
    </div>
  );
}

export default App;
