import {
  ArrowRightIcon,
  CheckCircle2Icon,
  RefreshCwIcon,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ChoiceCardProps = {
  icon: LucideIcon;
  title: string;
  badge?: string;
  description?: string;
  points?: string[];
  actionLabel: string;
  selected?: boolean;
  future?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
};

export function ChoiceCard({
  icon: Icon,
  title,
  badge,
  description,
  points = [],
  actionLabel,
  selected = false,
  future = false,
  disabled = false,
  loading = false,
  onClick,
}: ChoiceCardProps) {
  const actionDisabled = disabled || future;

  return (
    <Card
      size="sm"
      className={cn(
        "min-h-[18rem] min-w-0 rounded-lg border border-border bg-card shadow-sm transition-[border-color,background-color,box-shadow,transform] duration-150 hover:-translate-y-0.5",
        selected && "hover:border-primary/35 hover:shadow-md",
        !selected && "hover:border-border/90 hover:shadow-md",
        future && "bg-card/70 hover:border-border hover:bg-card",
      )}
    >
      <CardHeader className="gap-3">
        <div className="flex min-w-0 flex-col items-start gap-3">
          <div
            data-testid="choice-card-icon-shell"
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg border bg-transparent shadow-sm transition-[border-color,color,box-shadow,transform] group-hover/card:-translate-y-0.5",
              selected &&
                "border-primary/20 text-primary shadow-primary/10 group-hover/card:border-primary/30",
              !selected &&
                "border-border/70 text-foreground/70 group-hover/card:border-primary/20 group-hover/card:text-primary",
              future &&
                "border-border/60 text-muted-foreground group-hover/card:border-border/80 group-hover/card:text-foreground/75",
            )}
          >
            <Icon className="size-5" aria-hidden={true} />
          </div>
          <CardTitle className="text-lg">{title}</CardTitle>
        </div>
        {description ? (
          <CardDescription
            className={cn(
              "text-sm leading-6",
              badge && "col-span-2 max-w-none",
            )}
          >
            {description}
          </CardDescription>
        ) : null}
        {badge ? (
          <CardAction className="row-span-1">
            <Badge variant="secondary">{badge}</Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      {points.length > 0 ? (
        <CardContent className="pt-0">
          <ul className="flex flex-col gap-2.5 text-sm text-foreground">
            {points.map((point) => (
              <li key={point} className="flex items-center gap-2.5">
                <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <CheckCircle2Icon className="size-3.5" aria-hidden={true} />
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      ) : null}
      <CardFooter className="mt-auto border-t-0 bg-transparent">
        <Button
          className="w-full"
          size="default"
          variant={selected ? "default" : "outline"}
          disabled={actionDisabled}
          onClick={onClick}
        >
          {loading ? (
            <RefreshCwIcon className="animate-spin" data-icon="inline-start" />
          ) : null}
          {actionLabel}
          {selected && !loading ? (
            <ArrowRightIcon data-icon="inline-end" />
          ) : null}
        </Button>
      </CardFooter>
    </Card>
  );
}
