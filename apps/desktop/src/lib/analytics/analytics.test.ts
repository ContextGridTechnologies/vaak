import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAnalytics,
  getErrorTelemetryEnabledPreference,
  getUsageAnalyticsEnabledPreference,
  setErrorTelemetryEnabledPreference,
  setUsageAnalyticsEnabledPreference,
} from "./analytics";

function storageWith(values: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(values));

  return {
    get length() {
      return data.size;
    },
    clear: vi.fn(() => data.clear()),
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(data.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => data.delete(key)),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
  };
}

describe("analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults telemetry preferences to disabled until the user opts in", () => {
    const storage = storageWith();

    expect(getUsageAnalyticsEnabledPreference(storage)).toBe(false);
    expect(getErrorTelemetryEnabledPreference(storage)).toBe(false);

    setUsageAnalyticsEnabledPreference(storage, true);
    setErrorTelemetryEnabledPreference(storage, true);
    expect(getUsageAnalyticsEnabledPreference(storage)).toBe(true);
    expect(getErrorTelemetryEnabledPreference(storage)).toBe(true);

    setUsageAnalyticsEnabledPreference(storage, false);
    setErrorTelemetryEnabledPreference(storage, false);
    expect(getUsageAnalyticsEnabledPreference(storage)).toBe(false);
    expect(getErrorTelemetryEnabledPreference(storage)).toBe(false);
  });

  it("does not initialize PostHog without a public key", () => {
    const posthog = {
      capture: vi.fn(),
      init: vi.fn(),
      opt_in_capturing: vi.fn(),
      opt_out_capturing: vi.fn(),
    };

    const analytics = createAnalytics({
      appVersion: "0.1.0",
      environment: {
        appEnv: "production",
        cloudBaseUrl: null,
        enableDebugUi: false,
        exposeProcessedAudioArtifacts: false,
        posthogHost: "https://us.i.posthog.com",
        posthogPublicKey: null,
      },
      posthog,
      storage: storageWith({ "vaak.telemetry.usage.enabled": "true" }),
    });

    expect(analytics.enabled).toBe(false);
    expect(posthog.init).not.toHaveBeenCalled();
    analytics.capture("app_opened");
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("initializes PostHog with privacy-safe defaults when telemetry is enabled", () => {
    const posthog = {
      capture: vi.fn(),
      init: vi.fn(),
      opt_in_capturing: vi.fn(),
      opt_out_capturing: vi.fn(),
    };

    const analytics = createAnalytics({
      appVersion: "0.1.0",
      environment: {
        appEnv: "production",
        cloudBaseUrl: null,
        enableDebugUi: false,
        exposeProcessedAudioArtifacts: false,
        posthogHost: "https://eu.i.posthog.com",
        posthogPublicKey: "phc_public_project_key",
      },
      posthog,
      storage: storageWith({ "vaak.telemetry.usage.enabled": "true" }),
    });

    expect(analytics.enabled).toBe(true);
    expect(posthog.init).toHaveBeenCalledWith(
      "phc_public_project_key",
      expect.objectContaining({
        api_host: "https://eu.i.posthog.com",
        autocapture: false,
        capture_pageview: false,
        disable_session_recording: true,
        persistence: "localStorage",
      }),
    );
    expect(posthog.opt_in_capturing).toHaveBeenCalled();
  });

  it("tracks first run only once per local install", () => {
    const posthog = {
      capture: vi.fn(),
      init: vi.fn(),
      opt_in_capturing: vi.fn(),
      opt_out_capturing: vi.fn(),
    };
    const storage = storageWith({ "vaak.telemetry.usage.enabled": "true" });
    const environment = {
      appEnv: "production" as const,
      cloudBaseUrl: null,
      enableDebugUi: false,
      exposeProcessedAudioArtifacts: false,
      posthogHost: "https://us.i.posthog.com",
      posthogPublicKey: "phc_public_project_key",
    };

    createAnalytics({
      appVersion: "0.1.0",
      environment,
      posthog,
      storage,
    }).captureAppOpened();
    createAnalytics({
      appVersion: "0.1.0",
      environment,
      posthog,
      storage,
    }).captureAppOpened();

    expect(posthog.capture).toHaveBeenCalledWith("app_installed_or_first_run", {
      app_env: "production",
      app_version: "0.1.0",
    });
    expect(posthog.capture).toHaveBeenCalledWith("app_opened", {
      app_env: "production",
      app_version: "0.1.0",
    });
    expect(posthog.capture).toHaveBeenCalledTimes(3);
  });

  it("applies telemetry preference changes during the current app session", () => {
    const posthog = {
      capture: vi.fn(),
      init: vi.fn(),
      opt_in_capturing: vi.fn(),
      opt_out_capturing: vi.fn(),
    };
    const storage = storageWith({ "vaak.telemetry.usage.enabled": "true" });
    const analytics = createAnalytics({
      appVersion: "0.1.0",
      environment: {
        appEnv: "production",
        cloudBaseUrl: null,
        enableDebugUi: false,
        exposeProcessedAudioArtifacts: false,
        posthogHost: "https://us.i.posthog.com",
        posthogPublicKey: "phc_public_project_key",
      },
      posthog,
      storage,
    });

    analytics.capture("app_opened");
    analytics.setUsageAnalyticsEnabled(false);
    analytics.capture("app_version_seen");
    analytics.setUsageAnalyticsEnabled(true);
    analytics.capture("app_version_seen");

    expect(analytics.enabled).toBe(true);
    expect(getUsageAnalyticsEnabledPreference(storage)).toBe(true);
    expect(posthog.opt_out_capturing).toHaveBeenCalledTimes(1);
    expect(posthog.opt_in_capturing).toHaveBeenCalledTimes(2);
    expect(posthog.capture).toHaveBeenCalledTimes(2);
    expect(posthog.capture).toHaveBeenNthCalledWith(1, "app_opened", {
      app_env: "production",
      app_version: "0.1.0",
    });
    expect(posthog.capture).toHaveBeenNthCalledWith(2, "app_version_seen", {
      app_env: "production",
      app_version: "0.1.0",
    });
  });

  it("sanitizes event properties before sending them to PostHog", () => {
    const posthog = {
      capture: vi.fn(),
      init: vi.fn(),
      opt_in_capturing: vi.fn(),
      opt_out_capturing: vi.fn(),
    };
    const analytics = createAnalytics({
      appVersion: "0.1.0",
      environment: {
        appEnv: "production",
        cloudBaseUrl: null,
        enableDebugUi: false,
        exposeProcessedAudioArtifacts: false,
        posthogHost: "https://us.i.posthog.com",
        posthogPublicKey: "phc_public_project_key",
      },
      posthog,
      storage: storageWith({ "vaak.telemetry.usage.enabled": "true" }),
    });

    analytics.capture(
      "app_opened",
      {
        allowedBoolean: true,
        allowedNumber: 7,
        allowedString: "provider",
        allowedNull: null,
        unsafeArray: ["transcript"],
        unsafeObject: { transcript: "secret" },
        unsafeUndefined: undefined,
      } as unknown as Record<string, unknown>,
    );

    expect(posthog.capture).toHaveBeenCalledWith("app_opened", {
      app_env: "production",
      app_version: "0.1.0",
      allowedBoolean: true,
      allowedNumber: 7,
      allowedString: "provider",
      allowedNull: null,
    });
  });

  it("redacts sensitive diagnostic strings before sending telemetry", () => {
    const posthog = {
      capture: vi.fn(),
      init: vi.fn(),
      opt_in_capturing: vi.fn(),
      opt_out_capturing: vi.fn(),
    };
    const analytics = createAnalytics({
      appVersion: "0.1.0",
      environment: {
        appEnv: "production",
        cloudBaseUrl: null,
        enableDebugUi: false,
        exposeProcessedAudioArtifacts: false,
        posthogHost: "https://us.i.posthog.com",
        posthogPublicKey: "phc_public_project_key",
      },
      posthog,
      storage: storageWith({ "vaak.telemetry.usage.enabled": "true" }),
    });

    analytics.capture("dictation_failed", {
      error_code: "provider_auth_failed",
      error_message:
        "OpenAI key sk-test-secret failed while reading C:\\Users\\nikhi\\Desktop\\Projects\\vaak\\audio.wav",
      provider_id: "openai",
    });

    expect(posthog.capture).toHaveBeenCalledWith("dictation_failed", {
      app_env: "production",
      app_version: "0.1.0",
      error_code: "provider_auth_failed",
      error_message:
        "OpenAI key [redacted_secret] failed while reading [redacted_path]",
      provider_id: "openai",
    });
  });

  it("does not initialize or capture when users toggle telemetry without a public key", () => {
    const posthog = {
      capture: vi.fn(),
      init: vi.fn(),
      opt_in_capturing: vi.fn(),
      opt_out_capturing: vi.fn(),
    };
    const storage = storageWith();
    const analytics = createAnalytics({
      appVersion: "0.1.0",
      environment: {
        appEnv: "production",
        cloudBaseUrl: null,
        enableDebugUi: false,
        exposeProcessedAudioArtifacts: false,
        posthogHost: "https://us.i.posthog.com",
        posthogPublicKey: null,
      },
      posthog,
      storage,
    });

    analytics.setUsageAnalyticsEnabled(false);
    analytics.setUsageAnalyticsEnabled(true);
    analytics.capture("app_opened");

    expect(analytics.enabled).toBe(false);
    expect(getUsageAnalyticsEnabledPreference(storage)).toBe(true);
    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalled();
    expect(posthog.opt_in_capturing).not.toHaveBeenCalled();
  });

  it("does not throw when PostHog calls fail", () => {
    const posthog = {
      capture: vi.fn(() => {
        throw new Error("posthog capture failed");
      }),
      init: vi.fn(() => {
        throw new Error("posthog init failed");
      }),
      opt_in_capturing: vi.fn(() => {
        throw new Error("posthog opt in failed");
      }),
      opt_out_capturing: vi.fn(() => {
        throw new Error("posthog opt out failed");
      }),
    };

    expect(() => {
      const analytics = createAnalytics({
        appVersion: "0.1.0",
        environment: {
          appEnv: "production",
          cloudBaseUrl: null,
          enableDebugUi: false,
          exposeProcessedAudioArtifacts: false,
          posthogHost: "https://us.i.posthog.com",
          posthogPublicKey: "phc_public_project_key",
        },
        posthog,
        storage: storageWith({ "vaak.telemetry.usage.enabled": "true" }),
      });

      analytics.capture("app_opened");
      analytics.setUsageAnalyticsEnabled(false);
      analytics.setUsageAnalyticsEnabled(true);
    }).not.toThrow();
  });

  it("captures sanitized handled errors only when error telemetry is enabled", () => {
    const posthog = {
      capture: vi.fn(),
      init: vi.fn(),
      opt_in_capturing: vi.fn(),
      opt_out_capturing: vi.fn(),
    };
    const analytics = createAnalytics({
      appVersion: "0.1.0",
      environment: {
        appEnv: "production",
        cloudBaseUrl: null,
        enableDebugUi: false,
        exposeProcessedAudioArtifacts: false,
        posthogHost: "https://us.i.posthog.com",
        posthogPublicKey: "phc_public_project_key",
      },
      posthog,
      storage: storageWith({ "vaak.telemetry.errors.enabled": "true" }),
    });

    analytics.capture("app_opened");
    analytics.captureError(
      new Error(
        "OpenAI key sk-test-secret failed at C:\\Users\\nikhi\\Desktop\\Projects\\vaak\\audio.wav",
      ),
      {
        code: "provider_auth_failed",
        handled: true,
        providerId: "openai",
        stage: "transcription",
      },
    );

    expect(posthog.capture).toHaveBeenCalledTimes(1);
    expect(posthog.capture).toHaveBeenCalledWith("error_captured", {
      app_env: "production",
      app_version: "0.1.0",
      error_code: "provider_auth_failed",
      error_message:
        "OpenAI key [redacted_secret] failed at [redacted_path]",
      error_stage: "transcription",
      handled: true,
      provider_id: "openai",
    });
  });

  it("does not capture handled errors when error telemetry is disabled", () => {
    const posthog = {
      capture: vi.fn(),
      init: vi.fn(),
      opt_in_capturing: vi.fn(),
      opt_out_capturing: vi.fn(),
    };
    const analytics = createAnalytics({
      appVersion: "0.1.0",
      environment: {
        appEnv: "production",
        cloudBaseUrl: null,
        enableDebugUi: false,
        exposeProcessedAudioArtifacts: false,
        posthogHost: "https://us.i.posthog.com",
        posthogPublicKey: "phc_public_project_key",
      },
      posthog,
      storage: storageWith(),
    });

    analytics.captureError("failed", {
      code: "unknown_error",
      handled: true,
      stage: "app_runtime",
    });

    expect(posthog.capture).not.toHaveBeenCalled();
  });
});
