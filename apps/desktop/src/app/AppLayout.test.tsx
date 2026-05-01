import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderApp } from "@/test/render";

import { AppLayout } from "./AppLayout";

describe("AppLayout", () => {
  it("uses the shared wide desktop content frame", () => {
    renderApp(<AppLayout>App content</AppLayout>);

    expect(screen.getByTestId("app-screen-content")).toHaveClass("max-w-6xl");
  });
});
