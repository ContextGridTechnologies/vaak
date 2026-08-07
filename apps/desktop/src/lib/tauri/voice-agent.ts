import { invokeTauri } from "./runtime";

export type AssemblyAiVoiceAgentToken = {
  token: string;
  session: VoiceAgentToolSnapshot;
};

export type VoiceAgentToolDefinition = {
  alias: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type VoiceAgentToolSnapshot = {
  sessionId: string;
  revision: number;
  tools: VoiceAgentToolDefinition[];
  instructions: string[];
};

export type VoiceAgentToolApproval = {
  approvalId: string;
  toolName: string;
  risk: string;
};

export type VoiceAgentToolResult = Record<string, unknown>;

export function getAssemblyAiVoiceAgentToken() {
  return invokeTauri<AssemblyAiVoiceAgentToken>(
    "get_assemblyai_voice_agent_token",
  );
}

export function executeVoiceAgentTool(input: {
  sessionId: string;
  revision: number;
  alias: string;
  providerCallId: string;
  arguments: Record<string, unknown>;
}) {
  return invokeTauri<VoiceAgentToolResult>("execute_voice_agent_tool", input);
}

export function releaseVoiceAgentToolSnapshot(sessionId: string) {
  return invokeTauri<boolean>("release_voice_agent_tool_snapshot", {
    sessionId,
  });
}

export function resolveVoiceAgentToolApproval(input: {
  sessionId: string;
  approvalId: string;
  approved: boolean;
}) {
  return invokeTauri<VoiceAgentToolResult>(
    "resolve_voice_agent_tool_approval",
    input,
  );
}
