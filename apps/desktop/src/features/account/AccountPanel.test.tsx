import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderApp } from "@/test/render";

import { AccountPanel } from "./AccountPanel";

describe("AccountPanel", () => {
  it("keeps account, sync, and cloud features optional placeholders", () => {
    renderApp(<AccountPanel />);

    expect(
      screen.getByText("Local dictation stays available without sign-in."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "When account features are ready, this section will handle sync and managed access without changing the local-first workflow.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign in/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sync/i })).not.toBeInTheDocument();
  });
});
