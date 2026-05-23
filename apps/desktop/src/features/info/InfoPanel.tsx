import { CircleCheckIcon, GitBranchIcon, InfoIcon, KeyRoundIcon } from "lucide-react";

import { appScreenContentClassName } from "@/components/app";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const quickFacts = [
  {
    icon: CircleCheckIcon,
    label: "Local-first by default",
    value: "Audio history and settings stay on this device unless you choose otherwise.",
  },
  {
    icon: KeyRoundIcon,
    label: "Bring your own key",
    value: "Use your own supported speech provider credentials for transcription.",
  },
  {
    icon: GitBranchIcon,
    label: "Open source",
    value: "Vaak is built as a desktop workflow tool with public release builds.",
  },
] as const;

export function InfoPanel() {
  return (
    <div className="min-h-full bg-background text-foreground">
      <main
        data-testid="info-screen-content"
        className={cn(appScreenContentClassName, "max-w-[74rem] gap-5")}
      >
        <section
          data-testid="info-screen-shell"
          className="mx-auto flex w-full max-w-[52rem] flex-col gap-4"
        >
          <Card className="border-border/70 bg-card shadow-sm">
            <CardHeader className="gap-3">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background text-muted-foreground">
                  <InfoIcon className="size-4.5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">
                    Vaak
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Open-source, local-first voice input for desktop workflows.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border/70 bg-background px-3 py-2.5">
                  <dt className="text-xs font-medium uppercase text-muted-foreground">
                    Version
                  </dt>
                  <dd className="mt-1 font-mono text-sm text-foreground">
                    {__APP_VERSION__}
                  </dd>
                </div>
                <div className="rounded-lg border border-border/70 bg-background px-3 py-2.5">
                  <dt className="text-xs font-medium uppercase text-muted-foreground">
                    Release channel
                  </dt>
                  <dd className="mt-1 text-sm text-foreground">Windows installer</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card shadow-sm">
            <CardHeader>
              <h2 className="font-heading text-base font-medium leading-snug text-foreground">
                Quick info
              </h2>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {quickFacts.map((fact) => {
                  const Icon = fact.icon;

                  return (
                    <div
                      key={fact.label}
                      className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 rounded-lg border border-border/70 bg-background px-3 py-3"
                    >
                      <div className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Icon className="size-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">
                          {fact.label}
                        </div>
                        <p className="mt-0.5 text-sm leading-6 text-muted-foreground">
                          {fact.value}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
