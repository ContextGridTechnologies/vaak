import { useEffect, useState } from "react";
import { MapPinIcon, RefreshCcwIcon } from "lucide-react";

import { PermissionCallout } from "@/components/app";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
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
    setError(null);

    try {
      await restartVoiceCapsule();
      setEnabled(true);
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
    setError(null);

    try {
      await resetVoiceCapsulePosition();
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
    setError(null);

    try {
      const preferences = nextEnabled
        ? await enableVoiceCapsule()
        : await disableVoiceCapsule();
      setEnabled(preferences.voiceCapsuleEnabled);
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
        <FieldGroup className="gap-0">
          <Separator className="mb-6 bg-border/70" />

          <section
            aria-labelledby="voice-capsule-visibility-heading"
            className="flex flex-col gap-4"
          >
            <div>
              <h3
                id="voice-capsule-visibility-heading"
                className="text-base font-semibold text-foreground"
              >
                Visibility
              </h3>
              <p className="text-sm text-muted-foreground">
                Manage whether the floating dictation control is shown.
              </p>
            </div>

            <div className="flex flex-col gap-3 rounded-md border border-border/70 bg-background/70 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  Show voice capsule
                </p>
                <p className="text-sm text-muted-foreground">
                  Keep the floating control available after setup.
                </p>
              </div>
              <div className="flex items-center gap-3 sm:shrink-0">
                <span className="text-sm font-medium text-foreground">
                  {enabled ? "Enabled" : "Disabled"}
                </span>
                <Switch
                  aria-label="Show voice capsule"
                  checked={enabled}
                  disabled={!runningInTauri || busyAction !== null}
                  onCheckedChange={(nextEnabled) =>
                    void handleEnabledChange(nextEnabled)
                  }
                />
              </div>
            </div>
          </section>

          <Separator className="my-6 bg-border/70" />

          <section
            aria-labelledby="voice-capsule-controls-heading"
            className="flex flex-col gap-4"
          >
            <div>
              <h3
                id="voice-capsule-controls-heading"
                className="text-base font-semibold text-foreground"
              >
                Controls
              </h3>
              <p className="text-sm text-muted-foreground">
                Manage the floating dictation control behavior.
              </p>
            </div>

            <div className="overflow-hidden rounded-md border border-border/70 bg-background/70">
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-1 gap-3">
                  <RefreshCcwIcon
                    className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      Restart capsule
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Restart the floating control.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-fit sm:shrink-0"
                  disabled={!runningInTauri || busyAction !== null}
                  onClick={() => void handleRestart()}
                >
                  <RefreshCcwIcon data-icon="inline-start" aria-hidden="true" />
                  {busyAction === "restart" ? "Restarting..." : "Restart capsule"}
                </Button>
              </div>

              <Separator className="bg-border/70" />

              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-1 gap-3">
                  <MapPinIcon
                    className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      Reset position
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Return the floating control to its default screen position.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-fit sm:shrink-0"
                  disabled={!runningInTauri || busyAction !== null}
                  onClick={() => void handleResetPosition()}
                >
                  <MapPinIcon data-icon="inline-start" aria-hidden="true" />
                  {busyAction === "reset" ? "Resetting..." : "Reset position"}
                </Button>
              </div>
            </div>
          </section>

          {error ? (
            <div className="pt-4">
              <PermissionCallout tone="warning" title="Voice capsule update failed">
                {error}
              </PermissionCallout>
            </div>
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
