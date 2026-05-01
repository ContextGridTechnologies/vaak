import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Button } from "./button"

describe("Button", () => {
  it("uses a pointer cursor for enabled actions", () => {
    render(<Button>Continue</Button>)

    expect(screen.getByRole("button", { name: "Continue" })).toHaveClass(
      "cursor-pointer"
    )
  })

  it("keeps the disabled cursor state available", () => {
    render(<Button disabled>Continue</Button>)

    expect(screen.getByRole("button", { name: "Continue" })).toHaveClass(
      "disabled:cursor-not-allowed"
    )
  })

  it("gives primary actions a softer shape with visible depth", () => {
    render(<Button>Continue</Button>)

    expect(screen.getByRole("button", { name: "Continue" })).toHaveClass(
      "rounded-lg",
      "shadow-sm"
    )
  })

  it("keeps small buttons tall enough to feel like desktop actions", () => {
    render(<Button size="sm">Continue</Button>)

    expect(screen.getByRole("button", { name: "Continue" })).toHaveClass(
      "h-10",
      "text-sm"
    )
  })

  it("increases the default button height without changing the shared radius", () => {
    render(<Button>Continue</Button>)

    expect(screen.getByRole("button", { name: "Continue" })).toHaveClass(
      "h-11",
      "rounded-lg"
    )
  })
})
