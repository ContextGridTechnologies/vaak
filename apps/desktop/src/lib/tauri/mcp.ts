import { invokeTauri } from "./runtime";

export type McpToolGrant = "notGranted" | "always" | "ask" | "deny";

export type McpTool = {
  name: string;
  risk: "read" | "mutating" | "destructive";
  grant: McpToolGrant;
};

export type McpConnector = {
  connectorId: string;
  name: string;
  version: string;
  installed: boolean;
  enabled: boolean;
  bound: boolean;
  tools: McpTool[];
};

export type McpSkill = {
  skillId: string;
  name: string;
  enabled: boolean;
  bound: boolean;
};

export type McpConnectorTestResult = {
  ready: boolean;
  discoveredTools: string[];
};

export function getMcpConnectors() {
  return invokeTauri<McpConnector[]>("get_mcp_connectors");
}

export function installMcpConnector(connectorId: string) {
  return invokeTauri<boolean>("install_mcp_connector", { connectorId });
}

export function uninstallMcpConnector(connectorId: string) {
  return invokeTauri<boolean>("uninstall_mcp_connector", { connectorId });
}

export function setMcpConnectorEnabled(connectorId: string, enabled: boolean) {
  return invokeTauri<void>("set_mcp_connector_enabled", {
    connectorId,
    enabled,
  });
}

export function setMcpAgentBinding(connectorId: string, enabled: boolean) {
  return invokeTauri<void>("set_mcp_agent_binding", { connectorId, enabled });
}

export function setMcpToolGrant(
  connectorId: string,
  toolName: string,
  grant: Exclude<McpToolGrant, "notGranted">,
) {
  return invokeTauri<void>("set_mcp_tool_grant", {
    connectorId,
    toolName,
    grant,
  });
}

export function getMcpSkills() {
  return invokeTauri<McpSkill[]>("get_mcp_skills");
}

export function setMcpSkillBinding(skillId: string, enabled: boolean) {
  return invokeTauri<void>("set_mcp_skill_binding", { skillId, enabled });
}

export function testMcpConnector() {
  return invokeTauri<McpConnectorTestResult>("test_mcp_connector");
}
