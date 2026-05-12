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
});
