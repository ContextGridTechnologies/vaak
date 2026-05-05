import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(resolve(__dirname, "./globals.css"), "utf8");

function readToken(blockSelector: ":root" | ".dark", tokenName: string) {
  const escapedSelector = blockSelector.replace(".", "\\.");
  const block = globalsCss.match(
    new RegExp(`${escapedSelector} \\{(?<body>[\\s\\S]*?)\\n\\}`),
  )?.groups?.body;

  expect(block).toBeDefined();

  return block?.match(new RegExp(`${tokenName}: (?<value>[^;]+);`))?.groups
    ?.value;
}

describe("globals.css", () => {
  it("uses a clean white desktop palette without the page gradient", () => {
    expect(globalsCss).toContain("--background: #F8FBFD;");
    expect(globalsCss).toContain("--card: #F8FBFD;");
    expect(globalsCss).toContain("--muted: oklch(0.968 0.002 250);");
    expect(globalsCss).toContain("--border: oklch(0.92 0.004 250);");
    expect(globalsCss).toContain("--sidebar: #F8FBFD;");
    expect(globalsCss).not.toContain("linear-gradient");
  });

  it("preserves the primary brand color in dark mode", () => {
    expect(readToken(":root", "--primary")).toBe("#DD6040");
    expect(readToken(".dark", "--primary")).toBe("#DD6040");
  });
});
