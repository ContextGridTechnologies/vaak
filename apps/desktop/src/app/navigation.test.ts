import { describe, expect, it } from "vitest";

import { getAppSections } from "./navigation";

describe("navigation", () => {
  it("includes analytics in production builds", () => {
    expect(
      getAppSections({ appEnv: "development" }).map((section) => section.value),
    ).toContain("analytics");

    expect(
      getAppSections({ appEnv: "production" }).map((section) => section.value),
    ).toContain("analytics");
  });
});
