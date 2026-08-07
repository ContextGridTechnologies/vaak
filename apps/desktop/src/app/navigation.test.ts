import { describe, expect, it } from "vitest";

import { getAppSections } from "./navigation";

describe("navigation", () => {
  it("includes the voice agent destination", () => {
    expect(getAppSections().map((section) => section.value)).toContain(
      "voiceAgent",
    );
  });

  it("includes the MCP management destination", () => {
    expect(getAppSections().map((section) => section.value)).toContain("mcps");
  });

  it("includes analytics in production builds", () => {
    expect(
      getAppSections({ appEnv: "development" }).map((section) => section.value),
    ).toContain("analytics");

    expect(
      getAppSections({ appEnv: "production" }).map((section) => section.value),
    ).toContain("analytics");
  });
});
