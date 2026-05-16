import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { SystemThemeSync } from "./SystemThemeSync";
import { TelemetryStartup } from "./TelemetryStartup";
import { ReleaseUpdateNotifier } from "./ReleaseUpdateNotifier";

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <TooltipProvider>
      <SystemThemeSync />
      <TelemetryStartup />
      <ReleaseUpdateNotifier />
      {children}
      <Toaster position="bottom-right" richColors />
    </TooltipProvider>
  );
}
