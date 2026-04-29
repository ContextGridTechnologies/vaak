import type { ReactNode } from "react";
import {
  CircleCheckIcon,
  InfoIcon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { cn } from "@/lib/utils";

type PermissionTone = "info" | "success" | "warning" | "error";

type PermissionCalloutProps = {
  tone?: PermissionTone;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
};

const toneConfig = {
  info: {
    icon: InfoIcon,
    className: "border-border bg-card text-card-foreground",
  },
  success: {
    icon: CircleCheckIcon,
    className: "border-success/25 bg-success/10 text-foreground",
  },
  warning: {
    icon: TriangleAlertIcon,
    className: "border-warning/35 bg-warning/15 text-foreground",
  },
  error: {
    icon: OctagonXIcon,
    className: "border-destructive/25 bg-destructive/10 text-foreground",
  },
} satisfies Record<
  PermissionTone,
  { icon: typeof InfoIcon; className: string }
>;

export function PermissionCallout({
  tone = "info",
  title,
  children,
  action,
  className,
}: PermissionCalloutProps) {
  const config = toneConfig[tone];
  const Icon = config.icon;

  return (
    <Alert className={cn(config.className, className)}>
      <Icon aria-hidden="true" />
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      <AlertDescription>{children}</AlertDescription>
      {action ? <div className="mt-2 flex flex-wrap gap-2">{action}</div> : null}
    </Alert>
  );
}
