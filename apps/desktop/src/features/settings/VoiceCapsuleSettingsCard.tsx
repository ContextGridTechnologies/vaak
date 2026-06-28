import { useEffect, useState } from "react";
import { MapPinIcon, RefreshCcwIcon } from "lucide-react";

import { PermissionCallout } from "@/components/app";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { analytics } from "@/lib/analytics/browser";
import { normalizeError } from "@/lib/errors";
import {
  disableVoiceCapsule,
  enableVoiceCapsule,
  getAppShellPreferences,
  isTauriRuntime,
  resetVoiceCapsulePosition,
  restartVoiceCapsule,
} from "@/lib/tauri";

type BusyAction = "restart" | "reset" | "enabled" | null;

export function VoiceCapsuleSettingsCard() {
  const [enabled, setEnabled] = useState(true);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runningInTauri = isTauriRuntime();

  useEffect(() => {
    if (!runningInTauri) {
      return;
    }

    let cancelled = false;
    getAppShellPreferences()
      .then((preferences) => {
        if (!cancelled) {
          setEnabled(preferences.voiceCapsuleEnabled);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(normalizeError(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [runningInTauri]);

  async function handleRestart() {
    setBusyAction("restart");
    setStatus(null);
    setError(null);

    try {
      await restartVoiceCapsule();
      setEnabled(true);
      setStatus("Voice capsule restarted.");
      analytics.capture("setting_changed", {
        setting_id: "voice_capsule_restart",
      });
    } catch (err) {
      setError(normalizeError(err));
      analytics.captureError(err, {
        code: errorCodeFromUnknown(err, "voice_capsule_restart_failed"),
        handled: true,
        stage: "settings",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleResetPosition() {
    setBusyAction("reset");
    setStatus(null);
    setError(null);

    try {
      await resetVoiceCapsulePosition();
      setStatus("Voice capsule position reset.");
      analytics.capture("setting_changed", {
        setting_id: "voice_capsule_position_reset",
      });
    } catch (err) {
      setError(normalizeError(err));
      analytics.captureError(err, {
        code: errorCodeFromUnknown(err, "voice_capsule_position_reset_failed"),
        handled: true,
        stage: "settings",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleEnabledChange(nextEnabled: boolean) {
    const previousEnabled = enabled;
    setEnabled(nextEnabled);
    setBusyAction("enabled");
    setStatus(null);
    setError(null);

    try {
      const preferences = nextEnabled
        ? await enableVoiceCapsule()
        : await disableVoiceCapsule();
      setEnabled(preferences.voiceCapsuleEnabled);
      setStatus(
        preferences.voiceCapsuleEnabled
          ? "Voice capsule enabled."
          : "Voice capsule disabled.",
      );
      analytics.capture("setting_changed", {
        enabled: preferences.voiceCapsuleEnabled,
        setting_id: "voice_capsule_enabled",
      });
    } catch (err) {
      setEnabled(previousEnabled);
      setError(normalizeError(err));
      analytics.captureError(err, {
        code: errorCodeFromUnknown(err, "voice_capsule_toggle_failed"),
        handled: true,
        stage: "settings",
      });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <Card size="sm" className="rounded-lg bg-transparent py-0 shadow-none ring-0">
      <CardContent className="px-0">
        <FieldGroup className="gap-4 rounded-lg bg-muted/35 p-4">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold">Voice capsule</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage the floating dictation control.
              </p>
            </div>
            <Badge
              variant="outline"
              className={
                enabled
                  ? "mt-0.5 border-success/20 bg-success/10 text-success"
                  : "mt-0.5 border-border bg-background/55 text-muted-foreground"
              }
            >
              {enabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>

          <div className="flex flex-col gap-3 rounded-md bg-background/45 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                Show voice capsule
              </p>
              <p className="text-sm text-muted-foreground">
                Keep the floating control available after setup.
              </p>
            </div>
            <Switch
              aria-label="Show voice capsule"
              checked={enabled}
              disabled={!runningInTauri || busyAction !== null}
              onCheckedChange={(nextEnabled) =>
                void handleEnabledChange(nextEnabled)
              }
            />
          </div>

          <div className="flex flex-col gap-3 rounded-md bg-background/45 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                Capsule controls
              </p>
              <p className="text-sm text-muted-foreground">
                Restart the floating control or return it to its default screen
                position.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!runningInTauri || busyAction !== null}
                onClick={() => void handleRestart()}
              >
                <RefreshCcwIcon data-icon="inline-start" aria-hidden="true" />
                {busyAction === "restart" ? "Restarting..." : "Restart capsule"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!runningInTauri || busyAction !== null}
                onClick={() => void handleResetPosition()}
              >
                <MapPinIcon data-icon="inline-start" aria-hidden="true" />
                {busyAction === "reset" ? "Resetting..." : "Reset position"}
              </Button>
            </div>
          </div>

          {status ? (
            <PermissionCallout tone="success" title="Voice capsule updated">
              {status}
            </PermissionCallout>
          ) : null}

          {error ? (
            <PermissionCallout tone="warning" title="Voice capsule update failed">
              {error}
            </PermissionCallout>
          ) : null}
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function errorCodeFromUnknown(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const maybeCode = (err as { code?: unknown }).code;
    if (typeof maybeCode === "string" && maybeCode.trim().length > 0) {
      return maybeCode;
    }
  }

  return fallback;
}
