import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderApp } from "@/test/render";

import { HomePanel } from "./HomePanel";

describe("HomePanel", () => {
  it("renders a useful empty state when there is no active work", () => {
    renderApp(<HomePanel />);

    expect(screen.getByText("Ready for dictation")).toBeInTheDocument();
    expect(screen.getByText("No active session")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Start a voice session when you want to capture text. Vaak keeps this workspace clear until then.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Local-first workspace")).toBeInTheDocument();
    expect(screen.getByText("Provider keys stay yours")).toBeInTheDocument();
    expect(screen.getByText("Floating control ready")).toBeInTheDocument();
  });
});
