import { describe, expect, it } from "vitest";

import {
  createAssemblyAiSessionUpdate,
  decodePcm16Base64,
  encodePcm16Base64,
} from "./assemblyAiVoiceAgentProtocol";

describe("AssemblyAI voice-agent protocol", () => {
  it("registers only the Rust-owned opaque tool snapshot", () => {
    const tools = [
      {
        alias: "tool_opaque",
        description: "Create a folder inside the user's home directory.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "A relative path inside the home directory.",
            },
          },
          required: ["path"],
          additionalProperties: false,
        },
      },
    ];

    expect(
      createAssemblyAiSessionUpdate(tools, [
        "Inspect the accessibility snapshot before acting.",
      ]),
    ).toEqual({
      type: "session.update",
      session: {
        system_prompt: expect.stringContaining(
          "Inspect the accessibility snapshot before acting.",
        ),
        greeting: "Hi, I am ready to help.",
        input: { format: { encoding: "audio/pcm" } },
        output: {
          voice: "ivy",
          format: { encoding: "audio/pcm" },
        },
        tools: [
          {
            type: "function",
            name: "tool_opaque",
            description: expect.stringContaining("home directory"),
            parameters: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: expect.stringContaining("relative path"),
                },
              },
              required: ["path"],
              additionalProperties: false,
            },
          },
        ],
      },
    });
  });

  it("round-trips little-endian PCM16 bytes through base64", () => {
    const bytes = new Uint8Array([0, 0, 255, 127, 0, 128, 52, 18]);

    expect(Array.from(decodePcm16Base64(encodePcm16Base64(bytes)))).toEqual(
      Array.from(bytes),
    );
  });
});
