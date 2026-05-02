import {
  KeyboardIcon,
  Mic2Icon,
  MonitorUpIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

const readinessItems = [
  {
    label: "Local-first workspace",
    icon: ShieldCheckIcon,
  },
  {
    label: "Provider keys stay yours",
    icon: KeyboardIcon,
  },
  {
    label: "Floating control ready",
    icon: MonitorUpIcon,
  },
] as const;

export function HomePanel() {
  return (
    <div className="flex h-full min-h-[calc(100vh-var(--vaak-titlebar-height,0px))] items-center justify-center p-6">
      <Empty className="max-w-2xl overflow-hidden rounded-lg border border-solid border-border/70 bg-card px-10 py-12 shadow-sm">
        <div
          aria-hidden="true"
          className="h-px w-32 bg-linear-to-r from-transparent via-primary/45 to-transparent"
        />
        <EmptyMedia
          variant="icon"
          className="size-14 rounded-lg border border-primary/25 bg-primary/10 text-primary"
        >
          <Mic2Icon />
        </EmptyMedia>
        <EmptyHeader className="max-w-md gap-3">
          <Badge variant="secondary">No active session</Badge>
          <EmptyTitle className="text-lg">Ready for dictation</EmptyTitle>
          <EmptyDescription>
            Start a voice session when you want to capture text. Vaak keeps this
            workspace clear until then.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="max-w-xl">
          <div className="flex flex-wrap justify-center gap-2">
            {readinessItems.map((item) => {
              const Icon = item.icon;

              return (
                <Badge key={item.label} variant="outline">
                  <Icon data-icon="inline-start" />
                  {item.label}
                </Badge>
              );
            })}
          </div>
        </EmptyContent>
      </Empty>
    </div>
  );
}
