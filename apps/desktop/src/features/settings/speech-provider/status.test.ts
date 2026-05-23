import { describe, expect, it } from "vitest";

import { normalizeProviderError } from "./status";

describe("normalizeProviderError", () => {
  it("shows specific guidance for auth failures", () => {
    expect(
      normalizeProviderError("smallest", {
        code: "provider_auth_failed",
        message: "Smallest AI returned 401 Unauthorized",
      }),
    ).toBe(
      "Smallest AI rejected the saved API key. Check the key and save it again.",
    );
  });

  it("keeps retry timing visible for rate limits", () => {
    expect(
      normalizeProviderError("smallest", {
        code: "provider_rate_limited",
        message: "Smallest AI returned 429 Too Many Requests",
        retryAfterMs: 5000,
      }),
    ).toBe("Smallest AI is rate-limiting requests. Try again in 5 seconds.");
  });

  it("separates quota failures from key failures", () => {
    expect(
      normalizeProviderError("assemblyai", {
        code: "provider_quota_exhausted",
        message: "AssemblyAI returned 401 Unauthorized",
      }),
    ).toBe(
      "AssemblyAI account balance or usage limit is exhausted. Check billing, credits, or workspace limits.",
    );
  });

  it("explains provider-side bad audio requests", () => {
    expect(
      normalizeProviderError("smallest", {
        code: "provider_bad_request",
        message: "Smallest AI rejected the audio request",
      }),
    ).toBe(
      "Smallest AI rejected the audio request. Try a fresh recording or a shorter sample.",
    );
  });
});
