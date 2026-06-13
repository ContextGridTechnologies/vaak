import { useEffect, useState } from "react";
import { MapPinIcon, RefreshCcwIcon } from "lucide-react";

import {
  PermissionCallout,
  SectionPanel,
  StatusBadge,
} from "@/components/app";
import { Button } from "@/components/ui/button";
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
    <SectionPanel
      title="Voice capsule"
      description="Manage the floating dictation control."
      actions={
        <StatusBadge tone={enabled ? "success" : "neutral"}>
          {enabled ? "Enabled" : "Disabled"}
        </StatusBadge>
      }
      contentClassName="gap-3"
    >
      <div className="flex items-center justify-between gap-4 rounded-lg border bg-card/60 p-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium text-foreground">
            Show voice capsule
          </p>
          <p className="text-xs text-muted-foreground">
            Keep the floating control available after setup.
          </p>
        </div>
        <Switch
          aria-label="Show voice capsule"
          checked={enabled}
          disabled={!runningInTauri || busyAction !== null}
          onCheckedChange={(nextEnabled) => void handleEnabledChange(nextEnabled)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card/60 p-3">
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
    </SectionPanel>
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
