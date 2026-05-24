import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(resolve(__dirname, "./globals.css"), "utf8");

function readCssBlock(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = globalsCss.match(
    new RegExp(`${escapedSelector} \\{(?<body>[\\s\\S]*?)\\n\\}`),
  )?.groups?.body;

  expect(block).toBeDefined();

  return block ?? "";
}

function readToken(blockSelector: ":root" | ".dark", tokenName: string) {
  const block = readCssBlock(blockSelector);

  return block?.match(new RegExp(`${tokenName}: (?<value>[^;]+);`))?.groups
    ?.value;
}

describe("globals.css", () => {
  it("locks document scrolling to app-owned scroll regions", () => {
    expect(globalsCss).toContain("html,");
    expect(globalsCss).toContain("body,");
    expect(globalsCss).toContain("#root {");
    expect(globalsCss).toContain("height: 100%;");
    expect(globalsCss).toContain("min-height: 0;");
    expect(globalsCss).toContain("overflow: hidden;");
  });

  it("uses a clean white desktop palette with a branded content surface", () => {
    expect(globalsCss).toContain("--background: #F8FAFC;");
    expect(globalsCss).toContain("--card: #FFFFFF;");
    expect(globalsCss).toContain("--muted: oklch(0.945 0.005 250);");
    expect(globalsCss).toContain("--border: oklch(0.875 0.008 250);");
    expect(globalsCss).toContain("--sidebar: #F8FAFC;");
    expect(readCssBlock(".vaak-content-surface")).toContain(
      "background: var(--background);",
    );
  });

  it("preserves the primary brand color in dark mode", () => {
    expect(readToken(":root", "--primary")).toBe("#DD6040");
    expect(readToken(".dark", "--primary")).toBe("#DD6040");
  });

  it("defines a dark neutral shell that follows the dark background token", () => {
    const darkSurface = readCssBlock(".dark .vaak-content-surface");

    expect(globalsCss).toContain("--background: #0F141B;");
    expect(globalsCss).toContain("--card: #111820;");
    expect(globalsCss).toContain("--sidebar: #0F141B;");
    expect(darkSurface).toContain("background: var(--background);");
    expect(darkSurface).not.toContain("#ffffff");
    expect(darkSurface).not.toContain("#f8fafc");
    expect(darkSurface).not.toContain("#f1f6f8");
  });

  it("defines the shared branded scrollbar rules with stable idle visibility", () => {
    expect(globalsCss).toContain("--scrollbar-size: 0.7rem;");
    expect(globalsCss).toContain("--scrollbar-thumb: color-mix(in oklch, var(--foreground) 24%, transparent);");
    expect(globalsCss).toContain(".vaak-scroll-area {");
    expect(globalsCss).toContain("scrollbar-width: thin;");
    expect(globalsCss).toContain("scrollbar-color: transparent transparent;");
    expect(globalsCss).toContain(".vaak-scroll-area[data-scrollbar-visibility=\"visible\"],");
    expect(globalsCss).toContain(".vaak-scroll-area:focus-visible,");
    expect(globalsCss).toContain(".vaak-scroll-area::-webkit-scrollbar {");
    expect(globalsCss).toContain("width: var(--scrollbar-size);");
    expect(globalsCss).toContain("height: var(--scrollbar-size);");
    expect(readCssBlock(".vaak-scroll-area::-webkit-scrollbar")).not.toContain(
      "width: 0;",
    );
    expect(readCssBlock(".vaak-scroll-area::-webkit-scrollbar")).not.toContain(
      "height: 0;",
    );
  });
});
