import { useState } from "react";
import { ExternalLinkIcon, FolderOpenIcon } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

import { PermissionCallout, SectionPanel } from "@/components/app";
import { Button } from "@/components/ui/button";
import { normalizeError } from "@/lib/errors";
import {
  getDiagnosticsLocations,
  isTauriRuntime,
  type DiagnosticsLocations,
} from "@/lib/tauri";

export function DiagnosticsSettingsCard() {
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
    <SectionPanel
      title="Diagnostics"
      description="Review local app diagnostics before sharing them."
      contentClassName="gap-3"
      actions={
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
      }
    >
      <div className="rounded-lg border bg-card/60 p-3">
        <div className="flex items-start gap-3">
          <ExternalLinkIcon
            data-icon="inline-start"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium text-foreground">
              Crash reports are not sent automatically
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              Vaak keeps diagnostics on this computer. If you choose to share
              them, review the files first, then attach the relevant logs to a
              GitHub issue or support thread.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card/60 p-3">
        <p className="text-sm font-medium text-foreground">
          Logs may contain sensitive context
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Diagnostics can include app version, operating system details, error
          messages, stack traces, provider names, device state, and recent app
          actions. They should not include audio, transcripts, API keys, or
          provider credentials.
        </p>
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
    </SectionPanel>
  );
}
