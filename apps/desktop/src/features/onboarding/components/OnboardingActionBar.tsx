import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type OnboardingActionBarProps = {
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  align?: "center" | "between" | "end";
  className?: string;
};

const alignClassName = {
  center: "justify-center",
  between: "justify-between",
  end: "justify-end",
} as const;

export function OnboardingActionBar({
  primaryAction,
  secondaryAction,
  align = "center",
  className,
}: OnboardingActionBarProps) {
  return (
    <div
      data-testid="onboarding-action-bar"
      className={cn(
        "flex flex-wrap items-center gap-3",
        alignClassName[align],
        className,
      )}
    >
      {primaryAction}
      {secondaryAction}
    </div>
  );
}
