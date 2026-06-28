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
        <TabsContent value="info">Info content</TabsContent>
        <TabsContent value="account">Account content</TabsContent>
      </AppLayout>,
    );

    expect(screen.getByRole("button", { name: "Voice" })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByRole("button", { name: "Voice" })).toHaveClass(
      "cursor-pointer",
    );
    expect(
      within(screen.getByTestId("app-sidebar-primary")).getByRole("button", {
        name: "Settings",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toHaveClass(
      "cursor-pointer",
    );
    expect(screen.getByRole("button", { name: "Info" })).toHaveClass(
      "cursor-pointer",
    );
    expect(screen.queryByTestId("app-sidebar-utility")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Account/i })).not.toBeInTheDocument();
    expect(screen.getByText("Home content")).toBeInTheDocument();
  });

  it("shows the analytics navigation item", () => {
    renderLayout(
      <AppLayout>
        <TabsContent value="home">Home content</TabsContent>
        <TabsContent value="analytics">Analytics content</TabsContent>
      </AppLayout>,
    );

    expect(screen.getByRole("button", { name: "Analytics" })).toBeInTheDocument();
  });

  it("switches the sidebar to settings categories when Settings is opened", async () => {
    renderLayout(
      <AppLayout>
        <TabsContent value="home">Home content</TabsContent>
        <TabsContent value="settings">Settings content</TabsContent>
        <TabsContent value="analytics">Analytics content</TabsContent>
        <TabsContent value="info">Info content</TabsContent>
      </AppLayout>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    const sidebarMenu = within(screen.getByTestId("app-sidebar-primary"));
    expect(sidebarMenu.queryByRole("button", { name: "Voice" })).not.toBeInTheDocument();
    expect(sidebarMenu.queryByRole("button", { name: "Analytics" })).not.toBeInTheDocument();
    expect(sidebarMenu.queryByRole("button", { name: "Info" })).not.toBeInTheDocument();
    expect(sidebarMenu.getByRole("button", { name: "Speech provider" })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(sidebarMenu.queryByRole("button", { name: "Transcription mode" })).not.toBeInTheDocument();
    expect(sidebarMenu.getByRole("button", { name: "Microphone" })).toBeInTheDocument();
    expect(screen.getByTestId("app-shell")).toHaveStyle({
      "--sidebar-width": "14.5rem",
    });
    expect(screen.getByTestId("app-sidebar-brand-mark")).toHaveClass("size-7");
    expect(screen.getByRole("button", { name: "Back to Voice" })).toBeInTheDocument();
  });

  it("returns to the previous top-level section from settings mode", async () => {
    renderLayout(
      <AppLayout>
        <TabsContent value="home">Home content</TabsContent>
        <TabsContent value="settings">Settings content</TabsContent>
        <TabsContent value="analytics">Analytics content</TabsContent>
      </AppLayout>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Analytics" }));
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to Voice" }));

    expect(screen.getByText("Analytics content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analytics" })).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  it("keeps icon collapse behavior available in settings mode", async () => {
    renderLayout(
      <AppLayout>
        <TabsContent value="home">Home content</TabsContent>
        <TabsContent value="settings">Settings content</TabsContent>
      </AppLayout>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByTestId("app-sidebar-dock-toggle"));

    expect(screen.getByTestId("app-sidebar")).toHaveAttribute(
      "data-state",
      "collapsed",
    );
    expect(
      within(screen.getByTestId("app-sidebar-primary")).getByRole("button", {
        name: "Speech provider",
      }),
    ).toBeInTheDocument();
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
    expect(screen.getByTestId("app-shell")).toHaveStyle({
      "--sidebar-width": "11.75rem",
    });
    expect(within(screen.getByTestId("app-sidebar")).getByText("Vaak")).toBeInTheDocument();
    expect(screen.getByTestId("app-sidebar-brand-mark")).toHaveAttribute(
      "src",
      expect.stringContaining("32x32.png"),
    );
    expect(screen.queryByText("Workspace")).not.toBeInTheDocument();
    expect(screen.queryByTestId("app-sidebar-utility")).not.toBeInTheDocument();
    expect(screen.queryByText("User")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voice" })).toHaveClass("h-8");
    expect(screen.getByRole("button", { name: "Settings" })).toHaveClass("h-8");
    expect(screen.getByTestId("app-sidebar-nav-icon-home")).toHaveClass(
      "lucide-audio-lines",
    );
    expect(screen.getByTestId("app-sidebar-nav-icon-settings")).toHaveClass(
      "lucide-sliders-horizontal",
    );
    expect(screen.getByTestId("app-sidebar-nav-icon-info")).toHaveClass(
      "lucide-info",
    );
    expect(screen.getByTestId("app-sidebar-dock-toggle")).toHaveClass(
      "right-0",
      "translate-x-1/2",
      "size-7",
      "bottom-3",
    );
  });

  it("uses an independent main scroll region so the sidebar stays static", () => {
    renderLayout(
      <AppLayout>
        <TabsContent value="home">Home content</TabsContent>
      </AppLayout>,
    );

    expect(screen.getByTestId("app-shell")).toHaveClass("overflow-hidden");
    expect(screen.getByTestId("app-content-scroll-region")).toHaveClass(
      "min-h-0",
      "vaak-scroll-area",
    );
  });

  it("keeps preview notices inside the main scroll region instead of as a fake top bar", () => {
    renderLayout(
      <AppLayout notice={<div>Browser preview notice</div>}>
        <TabsContent value="home">Home content</TabsContent>
      </AppLayout>,
    );

    const scrollRegion = screen.getByTestId("app-content-scroll-region");

    expect(scrollRegion).toContainElement(
      screen.getByText("Browser preview notice"),
    );
    expect(scrollRegion.firstElementChild).toHaveAttribute(
      "data-testid",
      "app-shell-notice",
    );
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

    fireEvent.click(screen.getByTestId("app-sidebar-dock-toggle"));

    expect(screen.getByTestId("app-sidebar")).toHaveAttribute(
      "data-state",
      "collapsed",
    );
    await waitFor(() =>
      expectTauriCommand(tauri, "save_app_shell_preferences", {
        preferences: {
          sidebarCollapsed: true,
          voiceCapsuleEnabled: true,
        },
      }),
    );
    expectTauriCommand(tauri, "get_app_shell_preferences", undefined);
  });

  it("preserves voice capsule placement when saving sidebar collapse state", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_app_shell_preferences", {
      sidebarCollapsed: false,
      voiceCapsuleEnabled: true,
      voiceCapsulePlacement: {
        anchor: "bottomRight",
        offsetX: 32,
        offsetY: 20,
      },
    });
    tauri.resolveCommand("save_app_shell_preferences", {
      sidebarCollapsed: true,
      voiceCapsuleEnabled: true,
      voiceCapsulePlacement: {
        anchor: "bottomRight",
        offsetX: 32,
        offsetY: 20,
      },
    });

    renderLayout(
      <AppLayout>
        <TabsContent value="home">Home content</TabsContent>
      </AppLayout>,
    );

    await waitFor(() =>
      expectTauriCommand(tauri, "get_app_shell_preferences", undefined),
    );
    fireEvent.click(screen.getByTestId("app-sidebar-dock-toggle"));

    await waitFor(() =>
      expectTauriCommand(tauri, "save_app_shell_preferences", {
        preferences: {
          sidebarCollapsed: true,
          voiceCapsuleEnabled: true,
          voiceCapsulePlacement: {
            anchor: "bottomRight",
            offsetX: 32,
            offsetY: 20,
          },
        },
      }),
    );
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

  it("collapses the sidebar automatically on narrow viewports", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 480,
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

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: originalWidth,
    });
  });

  it("records app-shell preference checkpoints on mount", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("record_startup_checkpoint", undefined);
    tauri.resolveCommand("get_app_shell_preferences", {
      sidebarCollapsed: false,
    });

    renderLayout(
      <AppLayout>
        <TabsContent value="home">Home content</TabsContent>
      </AppLayout>,
    );

    await waitFor(() => {
      expectTauriCommand(tauri, "record_startup_checkpoint", {
        windowLabel: "main",
        checkpoint: "app_shell_preferences_requested",
      });
    });
    expectTauriCommand(tauri, "record_startup_checkpoint", {
      windowLabel: "main",
      checkpoint: "app_shell_preferences_loaded",
      detail: "sidebarCollapsed=false",
    });
  });
});
