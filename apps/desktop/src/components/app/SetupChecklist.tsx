import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
} from "lucide-react";

import { StatusBadge } from "@/components/app/StatusBadge";
import { cn } from "@/lib/utils";

export type SetupChecklistStatus = "complete" | "pending" | "blocked";

export type SetupChecklistItem = {
  id: string;
  title: string;
  description: string;
  status: SetupChecklistStatus;
  statusLabel: string;
};

type SetupChecklistProps = {
  items: SetupChecklistItem[];
  className?: string;
};

const statusIcon = {
  complete: CheckCircle2Icon,
  pending: CircleDashedIcon,
  blocked: AlertCircleIcon,
};

const statusTone = {
  complete: "success",
  pending: "neutral",
  blocked: "warning",
} as const;

const iconToneClass = {
  complete: "text-success",
  pending: "text-muted-foreground",
  blocked: "text-warning-foreground",
};

export function SetupChecklist({ items, className }: SetupChecklistProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {items.map((item) => {
        const Icon = statusIcon[item.status];

        return (
          <div
            key={item.id}
            className="flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-2.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 gap-3">
              <Icon
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  iconToneClass[item.status],
                )}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {item.title}
                </p>
                <p className="text-sm text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </div>
            <StatusBadge tone={statusTone[item.status]} className="shrink-0">
              {item.statusLabel}
            </StatusBadge>
          </div>
        );
      })}
    </div>
  );
}
