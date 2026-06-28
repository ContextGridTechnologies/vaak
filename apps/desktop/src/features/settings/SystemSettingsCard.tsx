import { useEffect, useState } from "react";

import { PermissionCallout } from "@/components/app";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  getErrorTelemetryEnabledPreference,
  getUsageAnalyticsEnabledPreference,
} from "@/lib/analytics";
import { analytics } from "@/lib/analytics/browser";
import { normalizeError } from "@/lib/errors";
import {
  getSystemSettings,
  isTauriRuntime,
  saveSystemSettings,
  type DictationMode,
} from "@/lib/tauri";

import { DiagnosticsSettingsBlock } from "./DiagnosticsSettingsCard";

const DEFAULT_DICTATION_MODE: DictationMode = "streaming";

export function SystemSettingsCard() {
  const [dictationMode, setDictationMode] = useState<DictationMode>(
    DEFAULT_DICTATION_MODE,
  );
  const [launchOnStartup, setLaunchOnStartup] = useState(true);
  const [showSkippedTranscripts, setShowSkippedTranscripts] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(() =>
    getUsageAnalyticsEnabledPreference(window.localStorage),
  );
  const [errorTelemetryEnabled, setErrorTelemetryEnabled] = useState(() =>
    getErrorTelemetryEnabledPreference(window.localStorage),
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
          setDictationMode(settings.dictationMode);
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
        dictationMode,
        launchOnStartup: nextValue,
        showSkippedTranscripts,
      });
      setDictationMode(savedSettings.dictationMode);
      setLaunchOnStartup(savedSettings.launchOnStartup);
      setShowSkippedTranscripts(savedSettings.showSkippedTranscripts);
      analytics.capture("setting_changed", {
        enabled: savedSettings.launchOnStartup,
        setting_id: "launch_on_startup",
      });
    } catch (err) {
      setLaunchOnStartup(previousValue);
      setError(normalizeError(err));
      analytics.captureError(err, {
        code: errorCodeFromUnknown(err, "settings_save_failed"),
        handled: true,
        stage: "settings",
      });
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
        dictationMode,
        launchOnStartup,
        showSkippedTranscripts: nextValue,
      });
      setDictationMode(savedSettings.dictationMode);
      setLaunchOnStartup(savedSettings.launchOnStartup);
      setShowSkippedTranscripts(savedSettings.showSkippedTranscripts);
      analytics.capture("setting_changed", {
        enabled: savedSettings.showSkippedTranscripts,
        setting_id: "show_skipped_transcripts",
      });
    } catch (err) {
      setShowSkippedTranscripts(previousValue);
      setError(normalizeError(err));
      analytics.captureError(err, {
        code: errorCodeFromUnknown(err, "settings_save_failed"),
        handled: true,
        stage: "settings",
      });
    } finally {
      setIsSaving(false);
    }
  }

  function handleAnalyticsChange(nextValue: boolean) {
    analytics.setUsageAnalyticsEnabled(nextValue);
    setAnalyticsEnabled(nextValue);
    analytics.capture("setting_changed", {
      enabled: nextValue,
      setting_id: "usage_analytics",
    });
  }

  function handleErrorTelemetryChange(nextValue: boolean) {
    analytics.setErrorTelemetryEnabled(nextValue);
    setErrorTelemetryEnabled(nextValue);
    analytics.capture("setting_changed", {
      enabled: nextValue,
      setting_id: "error_diagnostics",
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card size="sm" className="rounded-lg bg-transparent py-0 shadow-none ring-0">
        <CardHeader className="px-0">
          <CardTitle>System setting</CardTitle>
          <CardDescription>
            Control how Vaak integrates with your desktop session.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-0">
          <SettingSwitchRow
            title="Start Vaak on startup"
            description="Launch Vaak automatically after you sign in to this computer."
            checked={launchOnStartup}
            disabled={isSaving}
            ariaLabel="Start Vaak on startup"
            onCheckedChange={(nextValue) => void handleStartupChange(nextValue)}
          />

          <SettingSwitchRow
            title="Skipped transcripts"
            description="Show skipped no-op transcription attempts in Voice Activity."
            checked={showSkippedTranscripts}
            disabled={isSaving}
            ariaLabel="Show skipped transcripts in Voice Activity"
            onCheckedChange={(nextValue) =>
              void handleSkippedTranscriptsChange(nextValue)
            }
          />

          <SettingSwitchRow
            title="Usage analytics"
            description="Share privacy-safe usage events. Audio, transcripts, API keys, and file paths are never collected."
            checked={analyticsEnabled}
            ariaLabel="Share privacy-safe usage analytics"
            onCheckedChange={handleAnalyticsChange}
          />

          <SettingSwitchRow
            title="Crash reports"
            description="Send sanitized handled errors with app version, error code, and stage. Audio, transcripts, API keys, and provider responses are never collected."
            checked={errorTelemetryEnabled}
            ariaLabel="Send sanitized crash reports"
            onCheckedChange={handleErrorTelemetryChange}
          />

          {error ? (
            <PermissionCallout tone="warning" title="Startup setting failed">
              {error}
            </PermissionCallout>
          ) : null}
        </CardContent>
      </Card>

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
    </div>
  );
}

type SettingSwitchRowProps = {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  ariaLabel: string;
  onCheckedChange: (nextValue: boolean) => void;
};

function SettingSwitchRow({
  title,
  description,
  checked,
  disabled,
  ariaLabel,
  onCheckedChange,
}: SettingSwitchRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/45 p-3">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <Switch
        aria-label={ariaLabel}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
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
