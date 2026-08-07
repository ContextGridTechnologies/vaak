import { beforeEach, describe, expect, it } from "vitest";

import { createTauriCommandHarness, expectTauriCommand } from "@/test/tauri";
import {
  getMcpConnectors,
  getMcpSkills,
  installMcpConnector,
  setMcpAgentBinding,
  setMcpConnectorEnabled,
  setMcpSkillBinding,
  setMcpToolGrant,
  testMcpConnector,
  uninstallMcpConnector,
} from "./mcp";

describe("MCP Tauri commands", () => {
  const connectorId = "io.github.shanselman.flaui-mcp";
  let tauri: ReturnType<typeof createTauriCommandHarness>;

  beforeEach(() => {
    tauri = createTauriCommandHarness();
  });

  it("loads the connector and skill views", async () => {
    tauri.resolveCommand("get_mcp_connectors", []);
    tauri.resolveCommand("get_mcp_skills", []);

    await expect(getMcpConnectors()).resolves.toEqual([]);
    await expect(getMcpSkills()).resolves.toEqual([]);
    expectTauriCommand(tauri, "get_mcp_connectors", undefined);
    expectTauriCommand(tauri, "get_mcp_skills", undefined);
  });

  it("keeps lifecycle, binding, grant, skill, and health actions explicit", async () => {
    for (const command of [
      "install_mcp_connector",
      "uninstall_mcp_connector",
      "set_mcp_connector_enabled",
      "set_mcp_agent_binding",
      "set_mcp_tool_grant",
      "set_mcp_skill_binding",
      "test_mcp_connector",
    ]) {
      tauri.resolveCommand(command, command === "test_mcp_connector" ? { ready: true, discoveredTools: [] } : undefined);
    }

    await installMcpConnector(connectorId);
    await uninstallMcpConnector(connectorId);
    await setMcpConnectorEnabled(connectorId, true);
    await setMcpAgentBinding(connectorId, true);
    await setMcpToolGrant(connectorId, "windows_snapshot", "always");
    await setMcpSkillBinding("windows.desktop.basics", true);
    await testMcpConnector();

    expectTauriCommand(tauri, "install_mcp_connector", { connectorId });
    expectTauriCommand(tauri, "uninstall_mcp_connector", { connectorId });
    expectTauriCommand(tauri, "set_mcp_connector_enabled", { connectorId, enabled: true });
    expectTauriCommand(tauri, "set_mcp_agent_binding", { connectorId, enabled: true });
    expectTauriCommand(tauri, "set_mcp_tool_grant", {
      connectorId,
      toolName: "windows_snapshot",
      grant: "always",
    });
    expectTauriCommand(tauri, "set_mcp_skill_binding", {
      skillId: "windows.desktop.basics",
      enabled: true,
    });
    expectTauriCommand(tauri, "test_mcp_connector", undefined);
  });
});
