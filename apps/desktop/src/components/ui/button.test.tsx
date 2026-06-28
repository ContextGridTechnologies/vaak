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

  it("gives primary actions a compact shape with subtle depth", () => {
    render(<Button>Continue</Button>)

    expect(screen.getByRole("button", { name: "Continue" })).toHaveClass(
      "rounded-md",
      "shadow-xs"
    )
  })

  it("keeps small buttons compact enough for dense desktop actions", () => {
    render(<Button size="sm">Continue</Button>)

    expect(screen.getByRole("button", { name: "Continue" })).toHaveClass(
      "h-9",
      "text-sm"
    )
  })

  it("keeps the default button balanced without changing the shared radius", () => {
    render(<Button>Continue</Button>)

    expect(screen.getByRole("button", { name: "Continue" })).toHaveClass(
      "h-10",
      "rounded-md"
    )
  })
})
