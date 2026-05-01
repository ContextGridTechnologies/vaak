import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { AppHeader } from "./AppHeader";

export const appScreenContentClassName =
  "mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-6 sm:px-8 lg:py-7";

type AppScreenProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function AppScreen({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: AppScreenProps) {
  return (
    <div className={cn("min-h-screen bg-background text-foreground", className)}>
      <AppHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={actions}
      />
      <main
        data-testid="app-screen-content"
        className={cn(appScreenContentClassName, contentClassName)}
      >
        {children}
      </main>
    </div>
  );
}
