import type { ReactNode } from "react";

import { AppHeader } from "@/components/app";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { appSections } from "./navigation";

type AppLayoutProps = {
  notice?: ReactNode;
  children: ReactNode;
};

export function AppLayout({ notice, children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader
        eyebrow="Vaak"
        title="Voice Operations"
        description="BTC business desktop console"
      />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5 sm:px-6">
        {notice ? <div>{notice}</div> : null}
        <Tabs defaultValue="dictation" className="gap-4">
          <div className="overflow-x-auto">
            <TabsList className="w-max min-w-full justify-start sm:min-w-0">
              {appSections.map((section) => {
                const Icon = section.icon;

                return (
                  <TabsTrigger key={section.value} value={section.value}>
                    <Icon data-icon="inline-start" />
                    {section.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>
          {children}
        </Tabs>
      </main>
    </div>
  );
}
