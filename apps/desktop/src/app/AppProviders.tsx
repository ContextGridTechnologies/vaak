import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <TooltipProvider>
      {children}
      <Toaster position="bottom-right" richColors />
    </TooltipProvider>
  );
}
