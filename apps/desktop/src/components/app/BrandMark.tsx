import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

type BrandMarkProps = ComponentPropsWithoutRef<"span">;

export function BrandMark({ className, ...props }: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex items-center justify-center font-semibold leading-none",
        className,
      )}
      {...props}
    >
      व
    </span>
  );
}
