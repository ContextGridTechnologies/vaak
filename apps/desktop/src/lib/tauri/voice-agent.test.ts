import { beforeEach, describe, expect, it } from "vitest";

import {
  executeVoiceAgentTool,
  getAssemblyAiVoiceAgentToken,
  releaseVoiceAgentToolSnapshot,
  resolveVoiceAgentToolApproval,
} from "./voice-agent";
import {
  createTauriCommandHarness,
  expectTauriCommand,
  type TauriCommandHarness,
} from "@/test/tauri";

describe("voice agent Tauri bridge", () => {
  let tauri: TauriCommandHarness;

  beforeEach(() => {
    tauri = createTauriCommandHarness();
  });

  it("requests a short-lived AssemblyAI voice-agent token", async () => {
    tauri.resolveCommand("get_assemblyai_voice_agent_token", {
      token: "voice-token",
      session: {
        sessionId: "agent-session",
        revision: 1,
        instructions: [],
        tools: [
          {
            alias: "tool_opaque",
            description: "Create a folder inside the user's home directory.",
            inputSchema: {
              type: "object",
              properties: { path: { type: "string" } },
              required: ["path"],
              additionalProperties: false,
            },
          },
        ],
      },
    });

    await expect(getAssemblyAiVoiceAgentToken()).resolves.toMatchObject({
      token: "voice-token",
      session: {
        sessionId: "agent-session",
        tools: [{ alias: "tool_opaque" }],
      },
    });
    expectTauriCommand(
      tauri,
      "get_assemblyai_voice_agent_token",
      undefined,
    );
  });

  it("passes the Rust session and opaque alias back for tool execution", async () => {
    tauri.resolveCommand("execute_voice_agent_tool", {
      status: "created",
      path: "Desktop/Demo",
    });

    await expect(
      executeVoiceAgentTool({
        sessionId: "agent-session",
        revision: 1,
        alias: "tool_opaque",
        providerCallId: "provider-call-1",
        arguments: { path: "Desktop/Demo" },
      }),
    ).resolves.toMatchObject({ status: "created" });
    expectTauriCommand(tauri, "execute_voice_agent_tool", {
      sessionId: "agent-session",
      revision: 1,
      alias: "tool_opaque",
      providerCallId: "provider-call-1",
      arguments: { path: "Desktop/Demo" },
    });
  });

  it("releases the Rust snapshot when the voice session stops", async () => {
    tauri.resolveCommand("release_voice_agent_tool_snapshot", true);

    await expect(
      releaseVoiceAgentToolSnapshot("agent-session"),
    ).resolves.toBe(true);
    expectTauriCommand(tauri, "release_voice_agent_tool_snapshot", {
      sessionId: "agent-session",
    });
  });

  it("resolves only the pending approval in the matching Rust session", async () => {
    tauri.resolveCommand("resolve_voice_agent_tool_approval", {
      status: "denied",
      tool: "windows_click",
    });

    await resolveVoiceAgentToolApproval({
      sessionId: "agent-session",
      approvalId: "approval_opaque",
      approved: false,
    });

    expectTauriCommand(tauri, "resolve_voice_agent_tool_approval", {
      sessionId: "agent-session",
      approvalId: "approval_opaque",
      approved: false,
    });
  });
});
