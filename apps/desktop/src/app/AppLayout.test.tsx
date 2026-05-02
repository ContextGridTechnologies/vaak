import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

import { renderApp } from "@/test/render";
import { TabsContent } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  createTauriCommandHarness,
  expectTauriCommand,
} from "@/test/tauri";

import { AppLayout } from "./AppLayout";

function renderLayout(children: ReactElement) {
  return renderApp(<TooltipProvider>{children}</TooltipProvider>);
}

describe("AppLayout", () => {
  it("renders a sidebar-first shell without the old app header", () => {
    renderLayout(
      <AppLayout>
        <TabsContent value="home">Home content</TabsContent>
      </AppLayout>,
    );

    expect(screen.getByTestId("app-shell")).toHaveClass("min-h-full");
    expect(
      screen.queryByRole("heading", {
        name: "Open-source voice input for desktop workflows",
      }),
    ).not.toBeInTheDocument();
  });

  it("renders sidebar navigation with home selected by default", () => {
    renderLayout(
      <AppLayout>
        <TabsContent value="home">Home content</TabsContent>
        <TabsContent value="settings">Settings content</TabsContent>
        <TabsContent value="account">Account content</TabsContent>
      </AppLayout>,
    );

    expect(screen.getByRole("button", { name: "Home" })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(
      within(screen.getByTestId("app-sidebar-primary")).queryByRole("button", {
        name: "Settings",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("app-sidebar-utility")).getByRole("button", {
        name: "Settings",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Account Coming soon" }),
    ).toBeDisabled();
    expect(screen.getByText("Home content")).toBeInTheDocument();
  });

  it("keeps the sidebar pinned on the left with an icon collapse model", () => {
    renderLayout(
      <AppLayout>
        <TabsContent value="home">Home content</TabsContent>
      </AppLayout>,
    );

    expect(screen.getByTestId("app-shell")).toHaveClass("flex", "min-h-full");
    expect(screen.getByTestId("app-sidebar")).toHaveAttribute(
      "data-collapsible",
      "icon",
    );
    expect(
      within(screen.getByTestId("app-sidebar")).queryByText("Vaak"),
    ).not.toBeInTheDocument();
  });

  it("persists sidebar collapse state through the app shell preferences", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_app_shell_preferences", {
      sidebarCollapsed: false,
    });
    tauri.resolveCommand("save_app_shell_preferences", {
      sidebarCollapsed: true,
    });

    renderLayout(
      <AppLayout>
        <TabsContent value="home">Home content</TabsContent>
      </AppLayout>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));

    expect(screen.getByTestId("app-sidebar")).toHaveAttribute(
      "data-state",
      "collapsed",
    );
    await waitFor(() =>
      expectTauriCommand(tauri, "save_app_shell_preferences", {
        preferences: { sidebarCollapsed: true },
      }),
    );
    expectTauriCommand(tauri, "get_app_shell_preferences", undefined);
  });

  it("restores the persisted icon rail state on mount", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_app_shell_preferences", {
      sidebarCollapsed: true,
    });

    renderLayout(
      <AppLayout>
        <TabsContent value="home">Home content</TabsContent>
      </AppLayout>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("app-sidebar")).toHaveAttribute(
        "data-state",
        "collapsed",
      ),
    );
  });
});
