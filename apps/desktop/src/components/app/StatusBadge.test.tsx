import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders status text", () => {
    render(<StatusBadge tone="recording">Recording</StatusBadge>);

    expect(screen.getByText("Recording")).toBeInTheDocument();
  });

  it("uses semantic status classes", () => {
    render(<StatusBadge tone="success">Captured</StatusBadge>);

    expect(screen.getByText("Captured")).toHaveClass("text-success");
  });
});
