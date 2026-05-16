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
    expect(globalsCss).toContain("--background: #F8FBFD;");
    expect(globalsCss).toContain("--card: #F8FBFD;");
    expect(globalsCss).toContain("--muted: oklch(0.968 0.002 250);");
    expect(globalsCss).toContain("--border: oklch(0.92 0.004 250);");
    expect(globalsCss).toContain("--sidebar: #F8FBFD;");
    expect(readCssBlock(".vaak-content-surface")).toContain(
      "linear-gradient(135deg, #fffaf7 0%, #f8fbfd 52%, #f3f7f6 100%);",
    );
  });

  it("preserves the primary brand color in dark mode", () => {
    expect(readToken(":root", "--primary")).toBe("#DD6040");
    expect(readToken(".dark", "--primary")).toBe("#DD6040");
  });

  it("defines a dark branded content surface instead of reusing the light shell gradient", () => {
    const lightSurface = readCssBlock(".vaak-content-surface");
    const darkSurface = readCssBlock(".dark .vaak-content-surface");

    expect(darkSurface).toContain("linear-gradient(135deg");
    expect(darkSurface).not.toBe(lightSurface);
    expect(darkSurface).not.toContain("#fffaf7");
    expect(darkSurface).not.toContain("#f8fbfd");
    expect(darkSurface).not.toContain("#f3f7f6");
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
