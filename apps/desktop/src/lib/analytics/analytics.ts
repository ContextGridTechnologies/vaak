import type { AppEnvironment } from "@/config/app-env";

export type AnalyticsEventName =
  | "app_installed_or_first_run"
  | "app_opened"
  | "onboarding_started"
  | "onboarding_completed"
  | "provider_configured"
  | "dictation_started"
  | "dictation_completed"
  | "dictation_failed"
  | "settings_opened"
  | "app_version_seen";

export type AnalyticsProperties = Record<
  string,
  boolean | number | string | null
>;

type PostHogClient = {
  capture: (eventName: string, properties?: AnalyticsProperties) => void;
  init: (
    publicKey: string,
    options: {
      api_host: string;
      autocapture: boolean;
      capture_pageview: boolean;
      disable_session_recording: boolean;
      loaded: (client: PostHogLoadedClient) => void;
      persistence: "localStorage";
    },
  ) => unknown;
  opt_in_capturing: () => void;
  opt_out_capturing: () => void;
};

type PostHogLoadedClient = {
  opt_in_capturing: () => void;
};

export type Analytics = {
  capture: (
    eventName: AnalyticsEventName,
    properties?: AnalyticsProperties,
  ) => void;
  captureAppOpened: () => void;
  enabled: boolean;
};

type CreateAnalyticsOptions = {
  appVersion: string;
  environment: AppEnvironment;
  posthog: PostHogClient;
  storage: Storage;
};

const TELEMETRY_ENABLED_KEY = "vaak.telemetry.enabled";
const FIRST_RUN_CAPTURED_KEY = "vaak.analytics.firstRunCaptured";

export function getTelemetryEnabledPreference(storage: Storage): boolean {
  return storage.getItem(TELEMETRY_ENABLED_KEY) !== "false";
}

export function setTelemetryEnabledPreference(
  storage: Storage,
  enabled: boolean,
): void {
  storage.setItem(TELEMETRY_ENABLED_KEY, enabled ? "true" : "false");
}

export function createAnalytics({
  appVersion,
  environment,
  posthog,
  storage,
}: CreateAnalyticsOptions): Analytics {
  const enabled =
    environment.posthogPublicKey !== null &&
    getTelemetryEnabledPreference(storage);
  const baseProperties = {
    app_env: environment.appEnv,
    app_version: appVersion,
  };

  if (enabled && environment.posthogPublicKey !== null) {
    posthog.init(environment.posthogPublicKey, {
      api_host: environment.posthogHost,
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
      loaded: (client) => {
        client.opt_in_capturing();
      },
      persistence: "localStorage",
    });
    posthog.opt_in_capturing();
  } else {
    posthog.opt_out_capturing();
  }

  function capture(
    eventName: AnalyticsEventName,
    properties: AnalyticsProperties = {},
  ): void {
    if (!enabled) {
      return;
    }

    posthog.capture(eventName, {
      ...baseProperties,
      ...properties,
    });
  }

  function captureAppOpened(): void {
    if (!enabled) {
      return;
    }

    if (storage.getItem(FIRST_RUN_CAPTURED_KEY) !== "true") {
      capture("app_installed_or_first_run");
      storage.setItem(FIRST_RUN_CAPTURED_KEY, "true");
    }

    capture("app_opened");
  }

  return {
    capture,
    captureAppOpened,
    enabled,
  };
}
