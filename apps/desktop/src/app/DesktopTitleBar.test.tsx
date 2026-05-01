import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { renderApp } from "@/test/render";

import { DesktopTitleBar } from "./DesktopTitleBar";

describe("DesktopTitleBar", () => {
  const globalScope = globalThis as typeof globalThis & {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };

  afterEach(() => {
    delete globalScope.__TAURI__;
    delete globalScope.__TAURI_INTERNALS__;
  });

  it("uses the app background for the custom titlebar in Tauri", () => {
    globalScope.__TAURI__ = {};

    renderApp(<DesktopTitleBar />);

    expect(screen.getByLabelText("Vaak window controls")).toHaveClass(
      "bg-background",
    );
  });

  it("does not render in browser preview", () => {
    renderApp(<DesktopTitleBar />);

    expect(
      screen.queryByLabelText("Vaak window controls"),
    ).not.toBeInTheDocument();
  });
});
