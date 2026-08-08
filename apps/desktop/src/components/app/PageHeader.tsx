import type { ReactNode, Ref } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  titleRef?: Ref<HTMLHeadingElement>;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  titleRef,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 flex flex-col gap-1">
        <h1
          ref={titleRef}
          tabIndex={titleRef ? -1 : undefined}
          className="font-heading text-2xl font-semibold tracking-tight"
        >
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}
