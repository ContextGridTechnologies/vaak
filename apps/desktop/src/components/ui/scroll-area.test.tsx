import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { renderApp } from "@/test/render"

import { ScrollArea } from "./scroll-area"

describe("ScrollArea", () => {
  it("renders the shared app scrollbar contract by default", () => {
    renderApp(
      <ScrollArea data-testid="scroll-area">
        <div>Scrollable content</div>
      </ScrollArea>
    )

    expect(screen.getByTestId("scroll-area")).toHaveClass(
      "vaak-scroll-area",
      "min-h-0",
      "min-w-0",
      "overflow-auto"
    )
    expect(screen.getByTestId("scroll-area")).toHaveAttribute(
      "data-scrollbar-visibility",
      "hover"
    )
  })
})
