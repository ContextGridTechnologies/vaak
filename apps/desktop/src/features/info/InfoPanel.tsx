import { useState } from "react";
import {
  ChevronRightIcon,
  CircleCheckIcon,
  Code2Icon,
  FileTextIcon,
  GitBranchIcon,
  InfoIcon,
  KeyRoundIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";

import { PermissionCallout, appScreenContentClassName } from "@/components/app";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { normalizeError } from "@/lib/errors";
import { getDiagnosticsLocations, isTauriRuntime } from "@/lib/tauri";
import { cn } from "@/lib/utils";

const releasesUrl = "https://github.com/ContextGridTechnologies/vaak/releases";
const issuesUrl = "https://github.com/ContextGridTechnologies/vaak/issues/new";

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
    icon: Code2Icon,
    label: "Open source",
    value: "Vaak is built as a desktop workflow tool with public release builds.",
  },
] as const;

const supportRows = [
  {
    icon: FileTextIcon,
    label: "Diagnostics",
    value: "Review local logs before sharing support details.",
    action: "logs",
  },
  {
    icon: RefreshCwIcon,
    label: "Updates",
    value: "Check GitHub releases for the newest installer.",
    action: "releases",
  },
] as const;

export function InfoPanel() {
  const [isOpeningLogs, setIsOpeningLogs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runningInTauri = isTauriRuntime();

  async function handleOpenLogs() {
    if (!runningInTauri) {
      return;
    }

    setIsOpeningLogs(true);
    setError(null);
    try {
      const locations = await getDiagnosticsLocations();
      await revealItemInDir(locations.logDir);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setIsOpeningLogs(false);
    }
  }

  async function handleOpenUrl(url: string) {
    if (!runningInTauri) {
      return;
    }

    setError(null);
    try {
      await openUrl(url);
    } catch (err) {
      setError(normalizeError(err));
    }
  }

  return (
    <div className="min-h-full bg-background text-foreground">
      <main
        data-testid="info-screen-content"
        className={cn(appScreenContentClassName, "max-w-[74rem] gap-5")}
      >
        <section
          data-testid="info-screen-shell"
          className="mx-auto flex w-full max-w-[62rem] flex-col gap-6"
        >
          <section className="flex flex-col gap-5">
            <Separator className="bg-border/70" />

            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background/70 text-muted-foreground">
                  <InfoIcon className="size-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
                    Vaak
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground sm:text-base">
                    Open-source, local-first voice input for desktop workflows.
                  </p>
                </div>
              </div>
            </div>

            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-md border border-border/70 bg-background/70 px-4 py-3">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  VERSION
                </dt>
                <dd className="mt-1 font-mono text-base text-foreground">
                  {__APP_VERSION__}
                </dd>
              </div>
              <div className="rounded-md border border-border/70 bg-background/70 px-4 py-3">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  RELEASE CHANNEL
                </dt>
                <dd className="mt-1 text-base text-foreground">Windows installer</dd>
              </div>
            </dl>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!runningInTauri}
                onClick={() => void handleOpenUrl(releasesUrl)}
              >
                <GitBranchIcon data-icon="inline-start" aria-hidden="true" />
                View releases
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!runningInTauri || isOpeningLogs}
                onClick={() => void handleOpenLogs()}
              >
                <FileTextIcon data-icon="inline-start" aria-hidden="true" />
                {isOpeningLogs ? "Opening..." : "Open logs"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!runningInTauri}
                onClick={() => void handleOpenUrl(issuesUrl)}
              >
                <TriangleAlertIcon data-icon="inline-start" aria-hidden="true" />
                Report issue
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <div>
              <h2 className="font-heading text-base font-medium leading-snug text-foreground">
                Quick info
              </h2>
              <Separator className="mt-4 bg-border/70" />
            </div>

            <div className="flex flex-col">
              {quickFacts.map((fact, index) => {
                const Icon = fact.icon;

                return (
                  <div key={fact.label}>
                    <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-4 py-3">
                      <div className="flex size-11 items-center justify-center rounded-lg border border-border/70 bg-card/70 text-muted-foreground">
                        <Icon className="size-5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 self-center">
                        <div className="text-sm font-medium text-foreground">
                          {fact.label}
                        </div>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {fact.value}
                        </p>
                      </div>
                    </div>
                    {index < quickFacts.length - 1 ? (
                      <Separator className="bg-border/70" />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="font-heading text-base font-medium leading-snug text-foreground">
              Support
            </h2>

            <div className="overflow-hidden rounded-lg border border-border/70 bg-card/60">
              {supportRows.map((row, index) => {
                const Icon = row.icon;
                const onClick =
                  row.action === "logs"
                    ? () => void handleOpenLogs()
                    : () => void handleOpenUrl(releasesUrl);

                return (
                  <div key={row.label}>
                    <button
                      type="button"
                      className="grid w-full grid-cols-[3rem_minmax(0,1fr)_auto] gap-4 px-3 py-3 text-left transition-colors hover:bg-muted/45 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!runningInTauri || (row.action === "logs" && isOpeningLogs)}
                      onClick={onClick}
                    >
                      <div className="flex size-10 items-center justify-center rounded-lg border border-border/70 bg-background/70 text-muted-foreground">
                        <Icon className="size-5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 self-center">
                        <div className="text-sm font-medium text-foreground">
                          {row.label}
                        </div>
                        <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
                          {row.value}
                        </p>
                      </div>
                      <ChevronRightIcon
                        className="mt-3 size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </button>
                    {index < supportRows.length - 1 ? (
                      <Separator className="bg-border/70" />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          {error ? (
            <PermissionCallout tone="warning" title="Info action failed">
              {error}
            </PermissionCallout>
          ) : null}
        </section>
      </main>
    </div>
  );
}
