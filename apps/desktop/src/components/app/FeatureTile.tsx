import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";

type FeatureTileProps = {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  description: ReactNode;
  className?: string;
};

export function FeatureTile({
  icon: Icon,
  title,
  description,
  className,
}: FeatureTileProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-start gap-2.5 rounded-lg border bg-card p-2.5",
        className,
      )}
    >
      <Icon
        className="mt-0.5 size-4 shrink-0 text-primary"
        aria-hidden={true}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-[0.9rem] text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
