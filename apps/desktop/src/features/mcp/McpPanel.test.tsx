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

  it("shows connectors as catalog cards before opening connector controls", async () => {
    renderApp(<McpPanel />);

    expect(await screen.findByText("Windows Desktop (FlaUI)")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "MCP catalog", level: 1 })).toBeInTheDocument();
    expect(document.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
    expect(screen.getByText("Installed")).toBeInTheDocument();
    expect(screen.getByText("2 tools")).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Enable Windows Desktop (FlaUI)" })).not.toBeInTheDocument();

    const manageButton = screen.getByRole("button", { name: "Manage Windows Desktop (FlaUI)" });
    manageButton.focus();
    fireEvent.click(manageButton);

    expect(screen.getByRole("heading", { name: "Windows Desktop (FlaUI)", level: 1 })).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Connection", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tool permissions", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Enable Windows Desktop (FlaUI)" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Attach to Voice Agent" })).not.toBeChecked();
    expect(screen.getByRole("combobox", { name: "Permission for windows_snapshot" })).toHaveValue("notGranted");
    expect(screen.getByRole("switch", { name: "Attach Windows desktop basics" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Back to MCP catalog" }));

    expect(screen.queryByRole("switch", { name: "Enable Windows Desktop (FlaUI)" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage Windows Desktop (FlaUI)" })).toHaveFocus();
  });

  it("renders every connector returned by the catalog", async () => {
    tauri.resolveCommand("get_mcp_connectors", [
      {
        connectorId,
        name: "Windows Desktop (FlaUI)",
        version: "0.2.0",
        installed: true,
        enabled: false,
        bound: false,
        tools: [],
      },
      {
        connectorId: "com.example.second-mcp",
        name: "Second MCP",
        version: "1.0.0",
        installed: false,
        enabled: false,
        bound: false,
        tools: [],
      },
    ]);

    renderApp(<McpPanel />);

    expect(await screen.findByText("Windows Desktop (FlaUI)")).toBeInTheDocument();
    expect(screen.getByText("Second MCP")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage Windows Desktop (FlaUI)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View Second MCP" }));

    expect(screen.getByRole("heading", { name: "Second MCP", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Windows Desktop (FlaUI)" })).not.toBeInTheDocument();
  });

  it("shows an empty state when no reviewed connectors are available", async () => {
    tauri.resolveCommand("get_mcp_connectors", []);

    renderApp(<McpPanel />);

    expect(await screen.findByText("No MCPs are available for this device.")).toBeInTheDocument();
    expect(screen.queryByText("Loading MCP catalog…")).not.toBeInTheDocument();
  });

  it("does not report a failed catalog load as an empty catalog", async () => {
    tauri.rejectCommand("get_mcp_connectors", new Error("catalog unavailable"));

    renderApp(<McpPanel />);

    expect(await screen.findByText("MCP action failed")).toBeInTheDocument();
    expect(screen.getByText("catalog unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No MCPs are available for this device.")).not.toBeInTheDocument();
  });

  it("invokes explicit enable, bind, grant, and health commands", async () => {
    renderApp(<McpPanel />);
    await screen.findByText("Windows Desktop (FlaUI)");
    fireEvent.click(screen.getByRole("button", { name: "Manage Windows Desktop (FlaUI)" }));

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
