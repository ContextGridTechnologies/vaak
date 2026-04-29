import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageShellProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  notice?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function PageShell({
  eyebrow,
  title,
  subtitle,
  notice,
  actions,
  children,
  className,
}: PageShellProps) {
  return (
    <main
      className={cn(
        "mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6 sm:py-7",
        className,
      )}
    >
      <header className="flex flex-col gap-4 rounded-lg border bg-card px-4 py-4 text-card-foreground shadow-sm sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            {eyebrow ? (
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                {eyebrow}
              </p>
            ) : null}
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
                {title}
              </h1>
              {subtitle ? (
                <p className="max-w-3xl text-sm text-muted-foreground">
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
        {notice ? <div>{notice}</div> : null}
      </header>
      <div className="flex flex-col gap-4">{children}</div>
    </main>
  );
}
