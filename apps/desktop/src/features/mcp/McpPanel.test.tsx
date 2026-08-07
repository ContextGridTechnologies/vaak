import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { renderApp } from "@/test/render";
import { createTauriCommandHarness, expectTauriCommand } from "@/test/tauri";

import { McpPanel } from "./McpPanel";

describe("McpPanel", () => {
  const connectorId = "io.github.shanselman.flaui-mcp";
  let tauri: ReturnType<typeof createTauriCommandHarness>;

  beforeEach(() => {
    tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_mcp_connectors", [
      {
        connectorId,
        name: "Windows Desktop (FlaUI)",
        version: "0.2.0",
        installed: true,
        enabled: false,
        bound: false,
        tools: [
          { name: "windows_snapshot", risk: "read", grant: "notGranted" },
          { name: "windows_click", risk: "mutating", grant: "notGranted" },
        ],
      },
    ]);
    tauri.resolveCommand("get_mcp_skills", [
      {
        skillId: "windows.desktop.basics",
        name: "Windows desktop basics",
        enabled: true,
        bound: false,
      },
    ]);
    tauri.resolveCommand("set_mcp_connector_enabled", undefined);
    tauri.resolveCommand("set_mcp_agent_binding", undefined);
    tauri.resolveCommand("set_mcp_tool_grant", undefined);
    tauri.resolveCommand("test_mcp_connector", {
      ready: true,
      discoveredTools: ["windows_snapshot", "windows_click"],
    });
  });

  it("shows connector lifecycle, tools, binding, and skill as separate controls", async () => {
    renderApp(<McpPanel />);

    expect(await screen.findByText("Windows Desktop (FlaUI)")).toBeInTheDocument();
    expect(screen.getByText("Installed")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Enable Windows Desktop (FlaUI)" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Attach to Voice Agent" })).not.toBeChecked();
    expect(screen.getByRole("combobox", { name: "Permission for windows_snapshot" })).toHaveValue("notGranted");
    expect(screen.getByRole("switch", { name: "Attach Windows desktop basics" })).not.toBeChecked();
  });

  it("invokes explicit enable, bind, grant, and health commands", async () => {
    renderApp(<McpPanel />);
    await screen.findByText("Windows Desktop (FlaUI)");

    fireEvent.click(screen.getByRole("switch", { name: "Enable Windows Desktop (FlaUI)" }));
    fireEvent.click(screen.getByRole("switch", { name: "Attach to Voice Agent" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Permission for windows_snapshot" }), {
      target: { value: "always" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

    await waitFor(() => {
      expectTauriCommand(tauri, "set_mcp_connector_enabled", { connectorId, enabled: true });
      expectTauriCommand(tauri, "set_mcp_agent_binding", { connectorId, enabled: true });
      expectTauriCommand(tauri, "set_mcp_tool_grant", {
        connectorId,
        toolName: "windows_snapshot",
        grant: "always",
      });
      expectTauriCommand(tauri, "test_mcp_connector", undefined);
    });
    expect(await screen.findByText("Ready · 2 tools discovered")).toBeInTheDocument();
  });
});
