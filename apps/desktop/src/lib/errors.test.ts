import { describe, expect, it } from "vitest";

import { normalizeError } from "./errors";

describe("normalizeError", () => {
  it("returns string errors unchanged", () => {
    expect(normalizeError("Microphone unavailable")).toBe(
      "Microphone unavailable",
    );
  });

  it("combines code and message when both are present", () => {
    expect(
      normalizeError({
        code: "FOCUS_FAILED",
        message: "No writable field found",
      }),
    ).toBe("FOCUS_FAILED: No writable field found");
  });

  it("includes retry guidance when the provider supplies retry timing", () => {
    expect(
      normalizeError({
        code: "provider_rate_limited",
        message: "Smallest AI returned 429 Too Many Requests",
        retryAfterMs: 5000,
      }),
    ).toBe(
      "provider_rate_limited: Smallest AI returned 429 Too Many Requests Try again in 5 seconds.",
    );
  });

  it("falls back for unknown values", () => {
    expect(normalizeError(null)).toBe("Unknown error");
  });
});
