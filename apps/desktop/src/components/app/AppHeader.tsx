import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AppHeaderProps = {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function AppHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
  contentClassName,
}: AppHeaderProps) {
  return (
    <header
      className={cn(
        "border-b bg-background/95",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8",
          contentClassName,
        )}
      >
        <div className="flex min-w-0 flex-col gap-1">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              {eyebrow}
            </p>
          ) : null}
          <div className="flex min-w-0 flex-col">
            <h1 className="truncate text-lg font-semibold leading-tight text-foreground">
              {title}
            </h1>
            {description ? (
              <p className="truncate text-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </header>
  );
}
