import { describe, expect, it } from "vitest";

import { parseAppEnvironment } from "./app-env";

describe("parseAppEnvironment", () => {
  it("defaults to development settings outside production mode", () => {
    expect(parseAppEnvironment({}, "development")).toEqual({
      appEnv: "development",
      cloudBaseUrl: null,
      distributionChannel: "development",
      enableDebugUi: false,
      exposeProcessedAudioArtifacts: true,
      posthogHost: "https://us.i.posthog.com",
      posthogPublicKey: null,
    });
  });

  it("hides processed audio artifacts in production", () => {
    expect(
      parseAppEnvironment(
        {
          VITE_APP_ENV: "production",
        },
        "production",
      ),
    ).toEqual({
      appEnv: "production",
      cloudBaseUrl: null,
      distributionChannel: "github",
      enableDebugUi: false,
      exposeProcessedAudioArtifacts: false,
      posthogHost: "https://us.i.posthog.com",
      posthogPublicKey: null,
    });
  });

  it("rejects frontend secret-looking environment variables", () => {
    expect(() =>
      parseAppEnvironment(
        {
          VITE_OPENAI_API_KEY: "sk-test",
        },
        "development",
      ),
    ).toThrow(/must not expose secrets/i);
  });

  it("requires https cloud URLs in production", () => {
    expect(() =>
      parseAppEnvironment(
        {
          VITE_APP_ENV: "production",
          VITE_CLOUD_BASE_URL: "http://api.vaak.local",
        },
        "production",
      ),
    ).toThrow(/must use https/i);
  });

  it("rejects debug UI in production", () => {
    expect(() =>
      parseAppEnvironment(
        {
          VITE_APP_ENV: "production",
          VITE_ENABLE_DEBUG_UI: "true",
        },
        "production",
      ),
    ).toThrow(/debug ui/i);
  });

  it("accepts the public PostHog project key for frontend analytics", () => {
    expect(
      parseAppEnvironment(
        {
          VITE_POSTHOG_PUBLIC_KEY: "phc_public_project_key",
          VITE_POSTHOG_HOST: "https://eu.i.posthog.com",
        },
        "production",
      ),
    ).toMatchObject({
      posthogHost: "https://eu.i.posthog.com",
      posthogPublicKey: "phc_public_project_key",
    });
  });

  it("accepts explicit GitHub and Microsoft Store distribution channels", () => {
    expect(
      parseAppEnvironment(
        { VITE_DISTRIBUTION_CHANNEL: "microsoft_store" },
        "production",
      ),
    ).toMatchObject({ distributionChannel: "microsoft_store" });

    expect(
      parseAppEnvironment(
        { VITE_DISTRIBUTION_CHANNEL: "github" },
        "production",
      ),
    ).toMatchObject({ distributionChannel: "github" });
  });

  it("rejects unknown distribution channels", () => {
    expect(() =>
      parseAppEnvironment(
        { VITE_DISTRIBUTION_CHANNEL: "partner_center_preview" },
        "production",
      ),
    ).toThrow(/VITE_DISTRIBUTION_CHANNEL/i);
  });

  it("requires https PostHog hosts outside local development", () => {
    expect(() =>
      parseAppEnvironment(
        {
          VITE_APP_ENV: "production",
          VITE_POSTHOG_PUBLIC_KEY: "phc_public_project_key",
          VITE_POSTHOG_HOST: "http://analytics.example.com",
        },
        "production",
      ),
    ).toThrow(/VITE_POSTHOG_HOST must use https/i);
  });
});
