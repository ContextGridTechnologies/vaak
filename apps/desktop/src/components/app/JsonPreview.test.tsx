import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { JsonPreview } from "./JsonPreview";

describe("JsonPreview", () => {
  it("renders an empty state when value is null", () => {
    render(<JsonPreview value={null} emptyMessage="Capture a field first." />);

    expect(screen.getByText("No data yet")).toBeInTheDocument();
    expect(screen.getByText("Capture a field first.")).toBeInTheDocument();
  });

  it("renders formatted JSON when value exists", () => {
    render(
      <JsonPreview
        value={{ controlName: "Amount", characters: 12 }}
        emptyMessage="No data"
      />,
    );

    expect(screen.getByText(/"controlName": "Amount"/)).toBeInTheDocument();
    expect(screen.getByText(/"characters": 12/)).toBeInTheDocument();
  });
});
