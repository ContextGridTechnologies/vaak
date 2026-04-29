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
})
