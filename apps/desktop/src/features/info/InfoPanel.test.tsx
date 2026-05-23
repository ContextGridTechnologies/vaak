import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderApp } from "@/test/render";

import { InfoPanel } from "./InfoPanel";

describe("InfoPanel", () => {
  it("shows app version and quick product facts", () => {
    renderApp(<InfoPanel />);

    expect(screen.getByRole("heading", { name: "Vaak" })).toBeInTheDocument();
    expect(screen.getByText(__APP_VERSION__)).toBeInTheDocument();
    expect(screen.getByText("Quick info")).toBeInTheDocument();
    expect(screen.getByText("Local-first by default")).toBeInTheDocument();
    expect(screen.getByText("Bring your own key")).toBeInTheDocument();
    expect(screen.getByText("Open source")).toBeInTheDocument();
  });
});
