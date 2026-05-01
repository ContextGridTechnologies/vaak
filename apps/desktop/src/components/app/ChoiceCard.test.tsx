import { Mic2Icon } from "lucide-react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { renderApp } from "@/test/render";

import { ChoiceCard } from "./ChoiceCard";

describe("ChoiceCard", () => {
  it("renders a reusable selectable card with points and action", () => {
    renderApp(
      <ChoiceCard
        icon={Mic2Icon}
        title="Local setup"
        points={["No account required"]}
        actionLabel="Continue locally"
        selected
      />,
    );

    expect(screen.getByText("Local setup")).toBeInTheDocument();
    expect(screen.getByText("No account required")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue locally" }),
    ).toBeEnabled();
    expect(screen.getByTestId("choice-card-icon-shell")).toHaveClass(
      "bg-transparent",
      "rounded-lg"
    );
  });

  it("keeps the action area on the same surface as the rest of the card", () => {
    renderApp(
      <ChoiceCard
        icon={Mic2Icon}
        title="Local setup"
        points={["No account required"]}
        actionLabel="Continue locally"
        selected
      />,
    );

    const footer = screen
      .getByRole("button", { name: "Continue locally" })
      .closest("[data-slot='card-footer']");

    expect(footer).not.toHaveClass("bg-muted/50");
    expect(footer).not.toHaveClass("border-t");
  });

  it("keeps the featured option neutral at rest and adds a hover affordance", () => {
    renderApp(
      <ChoiceCard
        icon={Mic2Icon}
        title="Local setup"
        points={["No account required"]}
        actionLabel="Continue locally"
        selected
      />,
    );

    const card = screen
      .getByText("Local setup")
      .closest("[data-slot='card']");

    expect(card).toHaveClass("hover:border-primary/35", "hover:shadow-md");
    expect(card).not.toHaveClass("border-primary/60");
    expect(card).not.toHaveClass("bg-primary/5");
  });

  it("keeps coming-soon cards responsive on hover even when actions are disabled", () => {
    renderApp(
      <ChoiceCard
        icon={Mic2Icon}
        title="Managed Vaak"
        description="Use Vaak without provider setup."
        actionLabel="Coming later"
        future
        disabled
      />,
    );

    const card = screen
      .getByText("Managed Vaak")
      .closest("[data-slot='card']");

    expect(card).toHaveClass("hover:bg-card", "hover:border-border");
  });

  it("uses a shorter card height so onboarding feels denser", () => {
    renderApp(
      <ChoiceCard
        icon={Mic2Icon}
        title="Local setup"
        points={["No account required"]}
        actionLabel="Continue locally"
        selected
      />,
    );

    const card = screen
      .getByText("Local setup")
      .closest("[data-slot='card']");

    expect(card).toHaveClass("min-h-[18rem]");
    expect(card).not.toHaveClass("min-h-[19rem]");
  });

  it("removes the old gray icon background and keeps the icon shell refined", () => {
    renderApp(
      <ChoiceCard
        icon={Mic2Icon}
        title="Local setup"
        points={["No account required"]}
        actionLabel="Continue locally"
        selected
      />,
    );

    const iconShell = screen.getByTestId("choice-card-icon-shell");

    expect(iconShell).toHaveClass("bg-transparent", "border");
    expect(iconShell).not.toHaveClass("bg-muted");
    expect(iconShell).not.toHaveClass("rounded-full");
  });

  it("lets descriptive text use the full card header width when a badge is present", () => {
    renderApp(
      <ChoiceCard
        icon={Mic2Icon}
        title="Sign in for sync"
        badge="Coming soon"
        description="Sync dictionary, snippets, and preferences later."
        actionLabel="Coming soon"
        future
        disabled
      />,
    );

    expect(
      screen.getByText("Sync dictionary, snippets, and preferences later."),
    ).toHaveClass("col-span-2");
    expect(
      screen
        .getAllByText("Coming soon")
        .find((node) => node.closest("[data-slot='card-action']"))
        ?.closest("[data-slot='card-action']"),
    ).toHaveClass("row-span-1");
  });
});
