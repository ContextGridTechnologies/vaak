import {
  AlertTriangleIcon,
  MicIcon,
  RadioIcon,
} from "lucide-react";

import { StatusBadge } from "@/components/app";

export function FloatingCapsulePreview() {
  return (
    <div className="mx-auto flex w-full max-w-[18rem] flex-col items-center gap-3 rounded-[1.75rem] border border-border/80 bg-card/70 px-5 py-6 text-center shadow-sm">
      <div className="flex items-center gap-3 rounded-full border border-border bg-background px-4 py-3 shadow-sm">
        <div className="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground">
          <RadioIcon className="size-4" aria-hidden="true" />
        </div>
        <div className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
          <MicIcon className="size-5" aria-hidden="true" />
        </div>
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-4 w-1 rounded-full bg-primary/55" />
          <span className="h-6 w-1 rounded-full bg-primary" />
          <span className="h-5 w-1 rounded-full bg-primary/80" />
          <span className="h-3 w-1 rounded-full bg-primary/55" />
        </div>
        <div className="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground">
          <AlertTriangleIcon className="size-4 rotate-45" aria-hidden="true" />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <StatusBadge tone="neutral">Voice capsule preview</StatusBadge>
        <p className="max-w-[15rem] text-sm text-muted-foreground">
          Vaak stays close while you work, but it does not block local setup.
        </p>
      </div>
    </div>
  );
}
