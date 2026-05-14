import type { ReactNode } from "react";
import { InfoIcon } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type OnboardingShellProps = {
  header: ReactNode;
  children: ReactNode;
  footerHint?: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function OnboardingShell({
  header,
  children,
  footerHint,
  className,
  contentClassName,
}: OnboardingShellProps) {
  return (
    <div
      className={cn(
        "h-full min-h-0 bg-background text-foreground",
        className,
      )}
    >
      <ScrollArea
        data-testid="onboarding-scroll-region"
        className="h-full"
      >
        <main
          data-testid="app-screen-content"
          className={cn(
            "mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-[64rem] min-w-0 flex-col justify-center gap-6 px-4 py-10 sm:px-6 lg:py-14",
            contentClassName,
          )}
        >
          {header}
          {children}
          {footerHint ? (
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <InfoIcon className="size-4 shrink-0" aria-hidden={true} />
              <span>{footerHint}</span>
            </p>
          ) : null}
        </main>
      </ScrollArea>
    </div>
  );
}
