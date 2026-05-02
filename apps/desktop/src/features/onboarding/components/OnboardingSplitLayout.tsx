import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type OnboardingSplitLayoutProps = {
  main: ReactNode;
  aside: ReactNode;
  className?: string;
  mainClassName?: string;
  asideClassName?: string;
};

export function OnboardingSplitLayout({
  main,
  aside,
  className,
  mainClassName,
  asideClassName,
}: OnboardingSplitLayoutProps) {
  return (
    <section
      data-testid="onboarding-split-layout"
      className={cn(
        "grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-center",
        className,
      )}
    >
      <div className={cn("min-w-0", mainClassName)}>{main}</div>
      <aside className={cn("min-w-0", asideClassName)}>{aside}</aside>
    </section>
  );
}
