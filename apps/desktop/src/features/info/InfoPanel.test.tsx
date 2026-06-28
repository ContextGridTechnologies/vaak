import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderApp } from "@/test/render";

import { InfoPanel } from "./InfoPanel";

describe("InfoPanel", () => {
  it("shows app version and quick product facts", () => {
    renderApp(<InfoPanel />);

    expect(screen.getByRole("heading", { name: "Vaak" })).toBeInTheDocument();
    expect(screen.getByText(__APP_VERSION__)).toBeInTheDocument();
    expect(screen.getByText("RELEASE CHANNEL")).toBeInTheDocument();
    expect(screen.getByText("Windows installer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View releases" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open logs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Report issue" })).toBeInTheDocument();
    expect(screen.getByText("Quick info")).toBeInTheDocument();
    expect(screen.getByText("Local-first by default")).toBeInTheDocument();
    expect(screen.getByText("Bring your own key")).toBeInTheDocument();
    expect(screen.getByText("Open source")).toBeInTheDocument();
    expect(screen.getByText("Support")).toBeInTheDocument();
    expect(screen.getByText("Diagnostics")).toBeInTheDocument();
    expect(screen.getByText("Updates")).toBeInTheDocument();
  });
});
