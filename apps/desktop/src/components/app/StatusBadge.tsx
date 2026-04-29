import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusTone =
  | "neutral"
  | "active"
  | "success"
  | "warning"
  | "error"
  | "idle"
  | "recording"
  | "stopped";

type StatusBadgeProps = {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
};

const toneClasses: Record<StatusTone, string> = {
  neutral: "border-border bg-secondary text-secondary-foreground",
  idle: "border-border bg-secondary text-secondary-foreground",
  active: "border-primary/20 bg-primary/10 text-primary",
  recording: "border-destructive/20 bg-destructive/10 text-destructive",
  success: "border-success/20 bg-success/10 text-success",
  stopped: "border-success/20 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/15 text-warning-foreground",
  error: "border-destructive/20 bg-destructive/10 text-destructive",
};

export function StatusBadge({
  tone = "neutral",
  children,
  className,
}: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn("uppercase tracking-[0.08em]", toneClasses[tone], className)}
    >
      {children}
    </Badge>
  );
}
