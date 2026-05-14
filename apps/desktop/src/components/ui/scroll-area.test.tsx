import { act, fireEvent, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { renderApp } from "@/test/render"

import { ScrollArea } from "./scroll-area"

describe("ScrollArea", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

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
      "idle"
    )
  })

  it("shows the scrollbar during activity and hides it after inactivity", () => {
    vi.useFakeTimers()

    renderApp(
      <ScrollArea data-testid="scroll-area">
        <div>Scrollable content</div>
      </ScrollArea>
    )

    const scrollArea = screen.getByTestId("scroll-area")

    fireEvent.pointerMove(scrollArea)
    expect(scrollArea).toHaveAttribute("data-scrollbar-visibility", "visible")

    act(() => {
      vi.advanceTimersByTime(899)
    })
    expect(scrollArea).toHaveAttribute("data-scrollbar-visibility", "visible")

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(scrollArea).toHaveAttribute("data-scrollbar-visibility", "idle")
  })

  it("preserves caller event handlers while managing visibility", () => {
    vi.useFakeTimers()
    const onScroll = vi.fn()

    renderApp(
      <ScrollArea data-testid="scroll-area" onScroll={onScroll}>
        <div>Scrollable content</div>
      </ScrollArea>
    )

    const scrollArea = screen.getByTestId("scroll-area")

    fireEvent.scroll(scrollArea)

    expect(onScroll).toHaveBeenCalledTimes(1)
    expect(scrollArea).toHaveAttribute("data-scrollbar-visibility", "visible")
  })
})
