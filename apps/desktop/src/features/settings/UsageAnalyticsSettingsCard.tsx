import { useState } from "react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  getUsageAnalyticsEnabledPreference,
} from "@/lib/analytics";
import { analytics } from "@/lib/analytics/browser";

export function UsageAnalyticsSettingsCard() {
  const [enabled, setEnabled] = useState(() =>
    getUsageAnalyticsEnabledPreference(window.localStorage),
  );

  function handleEnabledChange(nextEnabled: boolean) {
    analytics.setUsageAnalyticsEnabled(nextEnabled);
    setEnabled(nextEnabled);
    analytics.capture("setting_changed", {
      enabled: nextEnabled,
      setting_id: "usage_analytics",
    });
  }

  return (
    <Card size="sm" className="rounded-lg shadow-none">
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardTitle>Usage analytics</CardTitle>
          <CardDescription>
            Share privacy-safe product usage events. Audio, transcripts, API
            keys, and file paths are never collected.
          </CardDescription>
        </div>
        <CardAction>
          <Switch
            aria-label="Share privacy-safe usage analytics"
            checked={enabled}
            onCheckedChange={handleEnabledChange}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        Helps us understand installs, app opens, onboarding completion, provider
        setup, and dictation reliability.
      </CardContent>
    </Card>
  );
}
