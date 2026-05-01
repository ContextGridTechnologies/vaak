import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(resolve(__dirname, "./globals.css"), "utf8");

describe("globals.css", () => {
  it("uses a warm white desktop palette without the page gradient", () => {
    expect(globalsCss).toContain("--background: oklch(0.988 0.002 95);");
    expect(globalsCss).toContain("--card: oklch(1 0 0);");
    expect(globalsCss).toContain("--muted: oklch(0.965 0.002 95);");
    expect(globalsCss).toContain("--border: oklch(0.92 0.004 95);");
    expect(globalsCss).not.toContain("linear-gradient");
  });
});
