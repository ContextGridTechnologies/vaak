import type { AppEnvironment } from "@/config/app-env";

export type AnalyticsEventName =
  | "app_installed_or_first_run"
  | "app_opened"
  | "error_captured"
  | "onboarding_started"
  | "onboarding_completed"
  | "onboarding_failed"
  | "provider_configured"
  | "provider_test_started"
  | "provider_test_completed"
  | "dictation_attempted"
  | "dictation_started"
  | "dictation_completed"
  | "dictation_failed"
  | "dictation_skipped"
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
  identify?: (distinctId: string) => void;
  init: (
    publicKey: string,
    options: {
      advanced_disable_flags: boolean;
      api_host: string;
      autocapture: boolean;
      capture_dead_clicks: boolean;
      capture_exceptions: boolean;
      capture_heatmaps: boolean;
      capture_pageleave: boolean;
      capture_pageview: boolean;
      capture_performance: boolean;
      disable_session_recording: boolean;
      disable_surveys: boolean;
      person_profiles: "identified_only";
      persistence: "localStorage";
      property_denylist: string[];
      rageclick: boolean;
      respect_dnt: boolean;
    },
  ) => unknown;
  opt_in_capturing: () => void;
  opt_out_capturing: () => void;
  register?: (properties: AnalyticsProperties) => void;
  reset?: () => void;
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
  setAuthenticatedUserId: (userId: string | null) => void;
  setTelemetryEnabled: (enabled: boolean) => void;
  setUsageAnalyticsEnabled: (enabled: boolean) => void;
  usageAnalyticsEnabled: boolean;
};

type CreateAnalyticsOptions = {
  appVersion: string;
  environment: Omit<AppEnvironment, "distributionChannel"> &
    Partial<Pick<AppEnvironment, "distributionChannel">>;
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
const POSTHOG_PROPERTY_DENYLIST = [
  "$browser",
  "$browser_version",
  "$current_url",
  "$device_type",
  "$host",
  "$os",
  "$os_version",
  "$pathname",
  "$raw_user_agent",
  "$referrer",
  "$referring_domain",
  "$screen_height",
  "$screen_width",
  "$session_entry_host",
  "$session_entry_pathname",
  "$session_entry_referrer",
  "$session_entry_referring_domain",
  "$session_entry_url",
  "$session_id",
  "$timezone",
  "$timezone_offset",
  "$viewport_height",
  "$viewport_width",
  "$window_id",
];
const EVENT_PROPERTY_ALLOWLIST: Record<
  AnalyticsEventName,
  readonly string[]
> = {
  app_installed_or_first_run: ["platform"],
  app_opened: ["platform"],
  app_version_seen: ["platform"],
  dictation_attempted: ["trigger"],
  dictation_completed: [
    "character_count_bucket",
    "insertion_duration_bucket",
    "insertion_method",
    "model_id",
    "provider_id",
    "target_input_kind",
    "total_duration_bucket",
    "transcription_duration_bucket",
    "trigger",
  ],
  dictation_failed: [
    "duration_bucket",
    "error_code",
    "error_stage",
    "provider_id",
    "target_input_kind",
    "trigger",
  ],
  dictation_skipped: [
    "duration_bucket",
    "provider_id",
    "skip_reason",
    "target_input_kind",
    "trigger",
  ],
  dictation_started: [
    "dictation_mode",
    "provider_id",
    "target_input_kind",
    "trigger",
  ],
  error_captured: [
    "error_code",
    "error_stage",
    "handled",
    "provider_id",
  ],
  onboarding_completed: ["duration_bucket", "mode", "provider_id"],
  onboarding_failed: ["error_code", "error_stage", "step_id"],
  onboarding_started: ["entry_point", "mode"],
  provider_configured: ["provider_family", "provider_id", "source"],
  provider_test_completed: [
    "duration_bucket",
    "error_code",
    "provider_id",
    "source",
    "status",
  ],
  provider_test_started: ["provider_id", "source"],
  setting_changed: ["enabled", "setting_id"],
  settings_opened: ["section"],
};

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
  let authenticatedUserId: string | null = null;
  const baseProperties = {
    app_env: environment.appEnv,
    app_version: appVersion,
    ...(environment.distributionChannel
      ? { distribution_channel: environment.distributionChannel }
      : {}),
  };

  function initializePostHog(): void {
    if (initialized || environment.posthogPublicKey === null) {
      return;
    }

    tryPostHogCall(() => {
      posthog.init(environment.posthogPublicKey!, {
        advanced_disable_flags: true,
        api_host: environment.posthogHost,
        autocapture: false,
        capture_dead_clicks: false,
        capture_exceptions: false,
        capture_heatmaps: false,
        capture_pageleave: false,
        capture_pageview: false,
        capture_performance: false,
        disable_session_recording: true,
        disable_surveys: true,
        person_profiles: "identified_only",
        persistence: "localStorage",
        property_denylist: POSTHOG_PROPERTY_DENYLIST,
        rageclick: false,
        respect_dnt: true,
      });
      posthog.register?.({ $geoip_disable: true });
      initialized = true;
      applyAuthenticatedIdentity();
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
        ...sanitizeAnalyticsProperties(
          allowlistedEventProperties(eventName, properties),
        ),
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

    // vaak: raw errors stay local; denylist redaction cannot prove that
    // provider messages contain no dictated content.
    void error;
    tryPostHogCall(() => {
      posthog.capture("error_captured", {
        ...sanitizeAnalyticsProperties(baseProperties),
        ...sanitizeAnalyticsProperties({
          error_code: properties.code,
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

  function setAuthenticatedUserId(userId: string | null): void {
    if (userId === null) {
      if (authenticatedUserId !== null && initialized) {
        tryPostHogCall(() => {
          posthog.reset?.();
        });
      }
      authenticatedUserId = null;
      return;
    }

    const normalizedUserId = userId.trim();
    if (!normalizedUserId || normalizedUserId === authenticatedUserId) {
      return;
    }

    authenticatedUserId = normalizedUserId;
    if (initialized) {
      applyAuthenticatedIdentity();
    }
  }

  function applyAuthenticatedIdentity(): void {
    if (authenticatedUserId === null) {
      return;
    }

    tryPostHogCall(() => {
      posthog.identify?.(authenticatedUserId!);
    });
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
    setAuthenticatedUserId,
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

function allowlistedEventProperties(
  eventName: AnalyticsEventName,
  properties: AnalyticsProperties,
): AnalyticsProperties {
  const allowedNames = EVENT_PROPERTY_ALLOWLIST[eventName];
  return Object.fromEntries(
    Object.entries(properties).filter(([name]) => allowedNames.includes(name)),
  );
}

function sanitizeAnalyticsString(value: string): string {
  return value
    .replace(SECRET_VALUE_PATTERN, "[redacted_secret]")
    .replace(WINDOWS_PATH_PATTERN, "[redacted_path]")
    .replace(UNIX_PATH_PATTERN, "[redacted_path]")
    .slice(0, MAX_ANALYTICS_STRING_LENGTH);
}
