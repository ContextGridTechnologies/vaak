import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderApp } from "@/test/render";

import { DiagnosticsPanel } from "./DiagnosticsPanel";

describe("DiagnosticsPanel", () => {
  it("uses the Vaak name in the default insert sample", () => {
    renderApp(<DiagnosticsPanel tauriAvailable={false} />);

    expect(screen.getByLabelText("Text to insert")).toHaveValue(
      "Hello from Vaak",
    );
  });
});
