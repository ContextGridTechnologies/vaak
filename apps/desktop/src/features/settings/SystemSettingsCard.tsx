import { useEffect, useState } from "react";

import { PermissionCallout, SectionPanel } from "@/components/app";
import { Switch } from "@/components/ui/switch";
import {
  getTelemetryEnabledPreference,
  setTelemetryEnabledPreference,
} from "@/lib/analytics";
import { normalizeError } from "@/lib/errors";
import {
  getSystemSettings,
  isTauriRuntime,
  saveSystemSettings,
} from "@/lib/tauri";

export function SystemSettingsCard() {
  const [launchOnStartup, setLaunchOnStartup] = useState(true);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(() =>
    getTelemetryEnabledPreference(window.localStorage),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let cancelled = false;
    getSystemSettings()
      .then((settings) => {
        if (!cancelled) {
          setLaunchOnStartup(settings.launchOnStartup);
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
  }, []);

  async function handleStartupChange(nextValue: boolean) {
    const previousValue = launchOnStartup;
    setLaunchOnStartup(nextValue);
    setIsSaving(true);
    setError(null);

    try {
      const savedSettings = await saveSystemSettings({
        launchOnStartup: nextValue,
      });
      setLaunchOnStartup(savedSettings.launchOnStartup);
    } catch (err) {
      setLaunchOnStartup(previousValue);
      setError(normalizeError(err));
    } finally {
      setIsSaving(false);
    }
  }

  function handleAnalyticsChange(nextValue: boolean) {
    setTelemetryEnabledPreference(window.localStorage, nextValue);
    setAnalyticsEnabled(nextValue);
  }

  return (
    <SectionPanel
      title="System setting"
      description="Control how Vaak integrates with your desktop session."
      contentClassName="gap-3"
    >
      <div className="flex items-center justify-between gap-4 rounded-lg border bg-card/60 p-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium text-foreground">
            Start Vaak on startup
          </p>
          <p className="text-xs text-muted-foreground">
            Launch Vaak automatically after you sign in to this computer.
          </p>
        </div>
        <Switch
          aria-label="Start Vaak on startup"
          checked={launchOnStartup}
          disabled={isSaving}
          onCheckedChange={(nextValue) => void handleStartupChange(nextValue)}
        />
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border bg-card/60 p-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium text-foreground">
            Usage analytics
          </p>
          <p className="text-xs text-muted-foreground">
            Share privacy-safe usage events. Audio, transcripts, API keys, and
            file paths are never collected.
          </p>
        </div>
        <Switch
          aria-label="Share privacy-safe usage analytics"
          checked={analyticsEnabled}
          onCheckedChange={handleAnalyticsChange}
        />
      </div>

      {error ? (
        <PermissionCallout tone="warning" title="Startup setting failed">
          {error}
        </PermissionCallout>
      ) : null}
    </SectionPanel>
  );
}
