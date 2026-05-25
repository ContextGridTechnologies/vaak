import { useEffect, useState } from "react";

import { PermissionCallout, SectionPanel } from "@/components/app";
import { Switch } from "@/components/ui/switch";
import {
  getTelemetryEnabledPreference,
} from "@/lib/analytics";
import { analytics } from "@/lib/analytics/browser";
import { normalizeError } from "@/lib/errors";
import {
  getSystemSettings,
  isTauriRuntime,
  saveSystemSettings,
} from "@/lib/tauri";

export function SystemSettingsCard() {
  const [launchOnStartup, setLaunchOnStartup] = useState(true);
  const [showSkippedTranscripts, setShowSkippedTranscripts] = useState(false);
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
          setShowSkippedTranscripts(settings.showSkippedTranscripts);
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
        showSkippedTranscripts,
      });
      setLaunchOnStartup(savedSettings.launchOnStartup);
      setShowSkippedTranscripts(savedSettings.showSkippedTranscripts);
      analytics.capture("setting_changed", {
        enabled: savedSettings.launchOnStartup,
        setting_id: "launch_on_startup",
      });
    } catch (err) {
      setLaunchOnStartup(previousValue);
      setError(normalizeError(err));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSkippedTranscriptsChange(nextValue: boolean) {
    const previousValue = showSkippedTranscripts;
    setShowSkippedTranscripts(nextValue);
    setIsSaving(true);
    setError(null);

    try {
      const savedSettings = await saveSystemSettings({
        launchOnStartup,
        showSkippedTranscripts: nextValue,
      });
      setLaunchOnStartup(savedSettings.launchOnStartup);
      setShowSkippedTranscripts(savedSettings.showSkippedTranscripts);
      analytics.capture("setting_changed", {
        enabled: savedSettings.showSkippedTranscripts,
        setting_id: "show_skipped_transcripts",
      });
    } catch (err) {
      setShowSkippedTranscripts(previousValue);
      setError(normalizeError(err));
    } finally {
      setIsSaving(false);
    }
  }

  function handleAnalyticsChange(nextValue: boolean) {
    if (!nextValue) {
      analytics.capture("setting_changed", {
        enabled: false,
        setting_id: "usage_analytics",
      });
      analytics.setTelemetryEnabled(false);
      setAnalyticsEnabled(false);
      return;
    }

    analytics.setTelemetryEnabled(true);
    setAnalyticsEnabled(nextValue);
    analytics.capture("setting_changed", {
      enabled: true,
      setting_id: "usage_analytics",
    });
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
            Skipped transcripts
          </p>
          <p className="text-xs text-muted-foreground">
            Show skipped no-op transcription attempts in Voice Activity.
          </p>
        </div>
        <Switch
          aria-label="Show skipped transcripts in Voice Activity"
          checked={showSkippedTranscripts}
          disabled={isSaving}
          onCheckedChange={(nextValue) =>
            void handleSkippedTranscriptsChange(nextValue)
          }
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
