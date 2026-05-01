import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { AppHeader } from "./AppHeader";

export const appScreenContentClassName =
  "mx-auto flex w-full max-w-[68rem] flex-col gap-4 px-4 py-5 sm:px-6 lg:py-6";

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
    <div className={cn("min-h-full bg-background text-foreground", className)}>
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
