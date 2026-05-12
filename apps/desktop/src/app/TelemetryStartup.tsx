import { useEffect } from "react";

import { analytics } from "@/lib/analytics/browser";

export function TelemetryStartup() {
  useEffect(() => {
    analytics.captureAppOpened();
  }, []);

  return null;
}
