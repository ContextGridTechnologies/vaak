import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(resolve(__dirname, "./globals.css"), "utf8");

describe("globals.css", () => {
  it("uses a clean white desktop palette without the page gradient", () => {
    expect(globalsCss).toContain("--background: #F8FBFD;");
    expect(globalsCss).toContain("--card: #F8FBFD;");
    expect(globalsCss).toContain("--muted: oklch(0.968 0.002 250);");
    expect(globalsCss).toContain("--border: oklch(0.92 0.004 250);");
    expect(globalsCss).toContain("--sidebar: #F8FBFD;");
    expect(globalsCss).not.toContain("linear-gradient");
  });
});
