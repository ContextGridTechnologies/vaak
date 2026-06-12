import type { AppEnvironment } from "@/config/app-env";

export type AnalyticsEventName =
  | "app_installed_or_first_run"
  | "app_opened"
  | "error_captured"
  | "onboarding_started"
  | "onboarding_completed"
  | "provider_configured"
  | "provider_test_started"
  | "provider_test_completed"
  | "dictation_started"
  | "dictation_completed"
  | "dictation_failed"
  | "settings_opened"
  | "setting_changed"
  | "app_version_seen";

export type AnalyticsProperties = Record<string, unknown>;

export type ErrorTelemetryProperties = {
  code: string;
  handled: boolean;
  providerId?: string;
  stage: string;
};

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
  captureError: (error: unknown, properties: ErrorTelemetryProperties) => void;
  enabled: boolean;
  errorTelemetryEnabled: boolean;
  setErrorTelemetryEnabled: (enabled: boolean) => void;
  setTelemetryEnabled: (enabled: boolean) => void;
  setUsageAnalyticsEnabled: (enabled: boolean) => void;
  usageAnalyticsEnabled: boolean;
};

type CreateAnalyticsOptions = {
  appVersion: string;
  environment: AppEnvironment;
  posthog: PostHogClient;
  storage: Storage;
};

const USAGE_ANALYTICS_ENABLED_KEY = "vaak.telemetry.usage.enabled";
const ERROR_TELEMETRY_ENABLED_KEY = "vaak.telemetry.errors.enabled";
const FIRST_RUN_CAPTURED_KEY = "vaak.analytics.firstRunCaptured";
const MAX_ANALYTICS_STRING_LENGTH = 160;
const SECRET_VALUE_PATTERN =
  /\b(?:sk-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]+|[A-Za-z0-9_-]*api[_-]?key[A-Za-z0-9_-]*)\b/gi;
const WINDOWS_PATH_PATTERN =
  /\b[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]*/g;
const UNIX_PATH_PATTERN =
  /(?<!\w)\/(?:Users|home|var|tmp|private|Volumes)\/[^\s"'<>]+/g;

export function getUsageAnalyticsEnabledPreference(storage: Storage): boolean {
  return storage.getItem(USAGE_ANALYTICS_ENABLED_KEY) === "true";
}

export function setUsageAnalyticsEnabledPreference(
  storage: Storage,
  enabled: boolean,
): void {
  storage.setItem(USAGE_ANALYTICS_ENABLED_KEY, enabled ? "true" : "false");
}

export function getErrorTelemetryEnabledPreference(storage: Storage): boolean {
  return storage.getItem(ERROR_TELEMETRY_ENABLED_KEY) === "true";
}

export function setErrorTelemetryEnabledPreference(
  storage: Storage,
  enabled: boolean,
): void {
  storage.setItem(ERROR_TELEMETRY_ENABLED_KEY, enabled ? "true" : "false");
}

export function createAnalytics({
  appVersion,
  environment,
  posthog,
  storage,
}: CreateAnalyticsOptions): Analytics {
  let usageAnalyticsEnabled =
    environment.posthogPublicKey !== null &&
    getUsageAnalyticsEnabledPreference(storage);
  let errorTelemetryEnabled =
    environment.posthogPublicKey !== null &&
    getErrorTelemetryEnabledPreference(storage);
  let initialized = false;
  const baseProperties = {
    app_env: environment.appEnv,
    app_version: appVersion,
  };

  function initializePostHog(): void {
    if (initialized || environment.posthogPublicKey === null) {
      return;
    }

    tryPostHogCall(() => {
      posthog.init(environment.posthogPublicKey!, {
        api_host: environment.posthogHost,
        autocapture: false,
        capture_pageview: false,
        disable_session_recording: true,
        loaded: (client) => {
          tryPostHogCall(() => {
            client.opt_in_capturing();
          });
        },
        persistence: "localStorage",
      });
      initialized = true;
    });
  }

  if (isAnyTelemetryEnabled()) {
    initializePostHog();
    tryPostHogCall(() => {
      posthog.opt_in_capturing();
    });
  } else {
    tryPostHogCall(() => {
      posthog.opt_out_capturing();
    });
  }

  function capture(
    eventName: AnalyticsEventName,
    properties: AnalyticsProperties = {},
  ): void {
    if (!usageAnalyticsEnabled) {
      return;
    }

    tryPostHogCall(() => {
      posthog.capture(eventName, {
        ...sanitizeAnalyticsProperties(baseProperties),
        ...sanitizeAnalyticsProperties(properties),
      });
    });
  }

  function captureAppOpened(): void {
    if (!usageAnalyticsEnabled) {
      return;
    }

    if (storage.getItem(FIRST_RUN_CAPTURED_KEY) !== "true") {
      capture("app_installed_or_first_run");
      storage.setItem(FIRST_RUN_CAPTURED_KEY, "true");
    }

    capture("app_opened");
  }

  function captureError(
    error: unknown,
    properties: ErrorTelemetryProperties,
  ): void {
    if (!errorTelemetryEnabled) {
      return;
    }

    const errorMessage = normalizeAnalyticsErrorMessage(error);
    tryPostHogCall(() => {
      posthog.capture("error_captured", {
        ...sanitizeAnalyticsProperties(baseProperties),
        ...sanitizeAnalyticsProperties({
          error_code: properties.code,
          error_message: errorMessage,
          error_stage: properties.stage,
          handled: properties.handled,
          provider_id: properties.providerId ?? null,
        }),
      });
    });
  }

  function setUsageAnalyticsEnabled(enabledPreference: boolean): void {
    setUsageAnalyticsEnabledPreference(storage, enabledPreference);
    usageAnalyticsEnabled =
      environment.posthogPublicKey !== null &&
      getUsageAnalyticsEnabledPreference(storage);

    syncPostHogCaptureState();
  }

  function setErrorTelemetryEnabled(enabledPreference: boolean): void {
    setErrorTelemetryEnabledPreference(storage, enabledPreference);
    errorTelemetryEnabled =
      environment.posthogPublicKey !== null &&
      getErrorTelemetryEnabledPreference(storage);

    syncPostHogCaptureState();
  }

  function syncPostHogCaptureState(): void {
    if (isAnyTelemetryEnabled()) {
      initializePostHog();
      tryPostHogCall(() => {
        posthog.opt_in_capturing();
      });
      return;
    }

    tryPostHogCall(() => {
      posthog.opt_out_capturing();
    });
  }

  function isAnyTelemetryEnabled(): boolean {
    return usageAnalyticsEnabled || errorTelemetryEnabled;
  }

  return {
    capture,
    captureAppOpened,
    captureError,
    get enabled() {
      return isAnyTelemetryEnabled();
    },
    get errorTelemetryEnabled() {
      return errorTelemetryEnabled;
    },
    setErrorTelemetryEnabled,
    setTelemetryEnabled: setUsageAnalyticsEnabled,
    setUsageAnalyticsEnabled,
    get usageAnalyticsEnabled() {
      return usageAnalyticsEnabled;
    },
  };
}

function tryPostHogCall(call: () => void): void {
  try {
    call();
  } catch {
    // Telemetry must never affect local app behavior.
  }
}

function sanitizeAnalyticsProperties(
  properties: AnalyticsProperties,
): Record<string, boolean | number | string | null> {
  const sanitized: Record<string, boolean | number | string | null> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (
      typeof value === "boolean" ||
      typeof value === "number" ||
      typeof value === "string" ||
      value === null
    ) {
      sanitized[key] =
        typeof value === "string" ? sanitizeAnalyticsString(value) : value;
    }
  }

  return sanitized;
}

function sanitizeAnalyticsString(value: string): string {
  return value
    .replace(SECRET_VALUE_PATTERN, "[redacted_secret]")
    .replace(WINDOWS_PATH_PATTERN, "[redacted_path]")
    .replace(UNIX_PATH_PATTERN, "[redacted_path]")
    .slice(0, MAX_ANALYTICS_STRING_LENGTH);
}

function normalizeAnalyticsErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string") {
      return maybeMessage;
    }
  }

  return "Unknown error";
}
