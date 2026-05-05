import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { renderApp } from "@/test/render";

import { AppProviders } from "./AppProviders";

describe("AppProviders", () => {
  afterEach(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "";
    delete (window as Partial<Window>).matchMedia;
  });

  it("mounts system theme syncing with the provider stack", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: () =>
        ({
          matches: true,
          media: "(prefers-color-scheme: dark)",
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => true,
        }) satisfies MediaQueryList,
    });

    renderApp(
      <AppProviders>
        <main>Provider content</main>
      </AppProviders>,
    );

    expect(screen.getByText("Provider content")).toBeInTheDocument();
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});
