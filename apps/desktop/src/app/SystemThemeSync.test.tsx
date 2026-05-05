import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SystemThemeSync } from "./SystemThemeSync";

type ThemeListener = (event: MediaQueryListEvent) => void;

function installMatchMedia(matches: boolean) {
  const listeners = new Set<ThemeListener>();
  let currentMatches = matches;
  const mediaQueryList = {
    get matches() {
      return currentMatches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_event: "change", listener: ThemeListener) => {
      listeners.add(listener);
    },
    removeEventListener: (_event: "change", listener: ThemeListener) => {
      listeners.delete(listener);
    },
    addListener: (listener: ThemeListener) => {
      listeners.add(listener);
    },
    removeListener: (listener: ThemeListener) => {
      listeners.delete(listener);
    },
    dispatchEvent: () => true,
  } as MediaQueryList;

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: () => mediaQueryList,
  });

  return {
    setMatches(nextMatches: boolean) {
      currentMatches = nextMatches;
      const event = { matches: nextMatches } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

function expectRootTheme(theme: "dark" | "light") {
  if (theme === "dark") {
    expect(document.documentElement).toHaveClass("dark");
  } else {
    expect(document.documentElement).not.toHaveClass("dark");
  }
  expect(document.documentElement.style.colorScheme).toBe(theme);
}

describe("SystemThemeSync", () => {
  afterEach(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "";
    delete (window as Partial<Window>).matchMedia;
  });

  it("applies the dark root theme when the OS prefers dark mode", () => {
    installMatchMedia(true);

    render(<SystemThemeSync />);

    expectRootTheme("dark");
  });

  it("updates the root theme when the OS preference switches to light mode", () => {
    const theme = installMatchMedia(true);
    render(<SystemThemeSync />);

    theme.setMatches(false);

    expectRootTheme("light");
  });

  it("falls back to the light root theme when matchMedia is unavailable", () => {
    delete (window as Partial<Window>).matchMedia;

    render(<SystemThemeSync />);

    expectRootTheme("light");
  });
});
