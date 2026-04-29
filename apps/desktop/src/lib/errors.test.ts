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

  it("falls back for unknown values", () => {
    expect(normalizeError(null)).toBe("Unknown error");
  });
});
