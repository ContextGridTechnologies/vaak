import { useState } from "react";
import { ExternalLinkIcon, FolderOpenIcon, ShieldAlertIcon } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

import { PermissionCallout } from "@/components/app";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { normalizeError } from "@/lib/errors";
import {
  getDiagnosticsLocations,
  isTauriRuntime,
  type DiagnosticsLocations,
} from "@/lib/tauri";

export function DiagnosticsSettingsCard() {
  return (
    <Card size="sm" className="rounded-lg bg-transparent py-0 shadow-none ring-0">
      <CardHeader className="px-0">
        <CardTitle>Diagnostics</CardTitle>
        <CardDescription>
          Review local logs and support files before sharing them.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <DiagnosticsSettingsBlock />
      </CardContent>
    </Card>
  );
}

export function DiagnosticsSettingsBlock() {
  const [locations, setLocations] = useState<DiagnosticsLocations | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOpenLogs() {
    if (!isTauriRuntime()) {
      return;
    }

    setIsOpening(true);
    setError(null);
    try {
      const nextLocations = await getDiagnosticsLocations();
      setLocations(nextLocations);
      await revealItemInDir(nextLocations.logDir);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setIsOpening(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!isTauriRuntime() || isOpening}
          onClick={() => void handleOpenLogs()}
        >
          <FolderOpenIcon data-icon="inline-start" />
          {isOpening ? "Opening..." : "Open logs"}
        </Button>
      </div>

      <div className="grid gap-2">
        <div
          data-testid="diagnostics-local-logs-row"
          className="flex items-start gap-3 rounded-lg bg-muted/45 p-3"
        >
          <ExternalLinkIcon
            data-icon="inline-start"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium text-foreground">
              Local logs are not sent automatically
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              Vaak keeps diagnostics on this computer. If you choose to share
              them, review the files first, then attach the relevant logs to a
              GitHub issue or support thread.
            </p>
          </div>
        </div>

        <div
          data-testid="diagnostics-sensitive-context-row"
          className="flex items-start gap-3 rounded-lg bg-muted/45 p-3"
        >
          <ShieldAlertIcon
            data-icon="inline-start"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium text-foreground">
              Logs may contain sensitive context
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              Diagnostics can include app version, operating system details,
              error messages, stack traces, provider names, device state, and
              recent app actions. They should not include audio, transcripts,
              API keys, or provider credentials.
            </p>
          </div>
        </div>
      </div>

      {locations ? (
        <p className="break-all rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Log folder: {locations.logDir}
        </p>
      ) : null}

      {error ? (
        <PermissionCallout tone="warning" title="Could not open logs">
          {error}
        </PermissionCallout>
      ) : null}
    </div>
  );
}
