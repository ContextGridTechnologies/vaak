import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAnalytics,
  getTelemetryEnabledPreference,
  setTelemetryEnabledPreference,
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

  it("defaults telemetry preference to enabled until the user changes it", () => {
    const storage = storageWith();

    expect(getTelemetryEnabledPreference(storage)).toBe(true);

    setTelemetryEnabledPreference(storage, false);
    expect(getTelemetryEnabledPreference(storage)).toBe(false);

    setTelemetryEnabledPreference(storage, true);
    expect(getTelemetryEnabledPreference(storage)).toBe(true);
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
      storage: storageWith(),
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
      storage: storageWith(),
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
    const storage = storageWith();
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
    const storage = storageWith();
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
    analytics.setTelemetryEnabled(false);
    analytics.capture("app_version_seen");
    analytics.setTelemetryEnabled(true);
    analytics.capture("app_version_seen");

    expect(analytics.enabled).toBe(true);
    expect(getTelemetryEnabledPreference(storage)).toBe(true);
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
      storage: storageWith(),
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
      storage: storageWith(),
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

    analytics.setTelemetryEnabled(false);
    analytics.setTelemetryEnabled(true);
    analytics.capture("app_opened");

    expect(analytics.enabled).toBe(false);
    expect(getTelemetryEnabledPreference(storage)).toBe(true);
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
        storage: storageWith(),
      });

      analytics.capture("app_opened");
      analytics.setTelemetryEnabled(false);
      analytics.setTelemetryEnabled(true);
    }).not.toThrow();
  });
});
