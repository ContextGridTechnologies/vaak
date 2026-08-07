import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  handleAgentEvent,
  useAssemblyAiVoiceAgent,
} from "./useAssemblyAiVoiceAgent";

const {
  executeVoiceAgentTool,
  getAssemblyAiVoiceAgentToken,
  recordStartupCheckpoint,
  releaseVoiceAgentToolSnapshot,
  resolveVoiceAgentToolApproval,
} = vi.hoisted(() => ({
  executeVoiceAgentTool: vi.fn(),
  getAssemblyAiVoiceAgentToken: vi.fn(),
  recordStartupCheckpoint: vi.fn(),
  releaseVoiceAgentToolSnapshot: vi.fn(),
  resolveVoiceAgentToolApproval: vi.fn(),
}));

vi.mock("@/lib/tauri", () => ({
  executeVoiceAgentTool,
  getAssemblyAiVoiceAgentToken,
  recordStartupCheckpoint,
  releaseVoiceAgentToolSnapshot,
  resolveVoiceAgentToolApproval,
}));

const toolSession = {
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
};

describe("AssemblyAI voice-agent events", () => {
  beforeEach(() => {
    executeVoiceAgentTool.mockReset();
    executeVoiceAgentTool.mockResolvedValue({
      status: "created",
      path: "Desktop/Demo",
    });
    recordStartupCheckpoint.mockReset();
    recordStartupCheckpoint.mockResolvedValue(undefined);
    releaseVoiceAgentToolSnapshot.mockReset();
    releaseVoiceAgentToolSnapshot.mockResolvedValue(true);
    resolveVoiceAgentToolApproval.mockReset();
    resolveVoiceAgentToolApproval.mockResolvedValue({ status: "denied" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the audio context before awaiting the temporary token", async () => {
    let resolveToken: (value: {
      token: string;
      session: typeof toolSession;
    }) => void = () => {};
    getAssemblyAiVoiceAgentToken.mockReturnValue(
      new Promise((resolve) => {
        resolveToken = resolve;
      }),
    );
    const close = vi.fn(async () => {});
    const resume = vi.fn(async () => {});
    const AudioContext = vi.fn(function AudioContextMock() {
      return {
        close,
        currentTime: 0,
        resume,
        state: "running",
      };
    });
    vi.stubGlobal("AudioContext", AudioContext);
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(async () => {
          throw new Error("stop after user-activation check");
        }),
      },
    });
    const { result } = renderHook(() => useAssemblyAiVoiceAgent());

    let startPromise: Promise<void> = Promise.resolve();
    act(() => {
      startPromise = result.current.start();
    });

    expect(AudioContext).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledTimes(1);

    resolveToken({ token: "voice-token", session: toolSession });
    await act(async () => startPromise);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("records the waveform click before starting voice-agent setup", async () => {
    getAssemblyAiVoiceAgentToken.mockRejectedValue(new Error("stop after click check"));
    vi.stubGlobal(
      "AudioContext",
      vi.fn(function AudioContextMock() {
        return {
          close: vi.fn(async () => {}),
          currentTime: 0,
          resume: vi.fn(async () => {}),
          state: "running",
        };
      }),
    );
    const { result } = renderHook(() => useAssemblyAiVoiceAgent());

    await act(async () => result.current.start());

    expect(recordStartupCheckpoint).toHaveBeenCalledWith({
      windowLabel: "voice-capsule",
      checkpoint: "voice_agent_start_requested",
    });
  });

  it("attributes main-window starts to the main renderer", async () => {
    getAssemblyAiVoiceAgentToken.mockRejectedValue(new Error("stop after checkpoint"));
    vi.stubGlobal(
      "AudioContext",
      vi.fn(function AudioContextMock() {
        return {
          close: vi.fn(async () => {}),
          currentTime: 0,
          resume: vi.fn(async () => {}),
          state: "running",
        };
      }),
    );
    const { result } = renderHook(() =>
      useAssemblyAiVoiceAgent({ windowLabel: "main" }),
    );

    await act(async () => result.current.start());

    expect(recordStartupCheckpoint).toHaveBeenCalledWith({
      windowLabel: "main",
      checkpoint: "voice_agent_start_requested",
    });
  });

  it("releases the Rust tool snapshot when startup fails after token minting", async () => {
    getAssemblyAiVoiceAgentToken.mockResolvedValue({
      token: "voice-token",
      session: toolSession,
    });
    vi.stubGlobal(
      "AudioContext",
      vi.fn(function AudioContextMock() {
        return {
          close: vi.fn(async () => {}),
          currentTime: 0,
          resume: vi.fn(async () => {}),
          state: "running",
        };
      }),
    );
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(async () => {
          throw new Error("microphone unavailable");
        }),
      },
    });
    const { result } = renderHook(() => useAssemblyAiVoiceAgent());

    await act(async () => result.current.start());

    expect(releaseVoiceAgentToolSnapshot).toHaveBeenCalledWith("agent-session");
  });

  it("scopes suspended audio recovery to the active session", async () => {
    getAssemblyAiVoiceAgentToken.mockResolvedValue({
      token: "voice-token",
      session: toolSession,
    });
    let rejectRecovery: (error: Error) => void = () => {};
    const resume = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockReturnValueOnce(
        new Promise<void>((_resolve, reject) => {
          rejectRecovery = reject;
        }),
      );
    const context = {
      audioWorklet: { addModule: vi.fn(async () => {}) },
      close: vi.fn(async () => {}),
      createMediaStreamSource: vi.fn(() => ({
        connect: vi.fn((node: unknown) => node),
        disconnect: vi.fn(),
      })),
      currentTime: 0,
      destination: {},
      onstatechange: null as (() => void) | null,
      resume,
      sampleRate: 24_000,
      state: "running",
    };
    vi.stubGlobal(
      "AudioContext",
      vi.fn(function AudioContextMock() {
        return context;
      }),
    );
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({
          getAudioTracks: () => [{}],
          getTracks: () => [{ stop: vi.fn() }],
        })),
      },
    });
    vi.stubGlobal(
      "AudioWorkletNode",
      vi.fn(function AudioWorkletNodeMock() {
        return {
          connect: vi.fn(() => ({ connect: vi.fn() })),
          disconnect: vi.fn(),
          port: { onmessage: null },
        };
      }),
    );
    class MockWebSocket {
      static OPEN = 1;
      readyState = 0;
      close = vi.fn();
    }
    vi.stubGlobal("WebSocket", MockWebSocket);
    const { result } = renderHook(() => useAssemblyAiVoiceAgent());

    await act(async () => result.current.start());
    expect(resume).toHaveBeenCalledTimes(1);

    context.state = "suspended";
    await act(async () => context.onstatechange?.());

    expect(resume).toHaveBeenCalledTimes(2);

    await act(async () => result.current.stop());
    context.state = "suspended";
    await act(async () => context.onstatechange?.());
    expect(resume).toHaveBeenCalledTimes(2);

    await act(async () => rejectRecovery(new Error("stale resume failure")));
    expect(result.current.state).toBe("ending");
  });

  it("records non-silent PCM after scheduling it on the output", async () => {
    getAssemblyAiVoiceAgentToken.mockResolvedValue({
      token: "voice-token",
      session: toolSession,
    });
    const startSource = vi.fn();
    const context = {
      audioWorklet: { addModule: vi.fn(async () => {}) },
      close: vi.fn(async () => {}),
      createBuffer: vi.fn(() => ({
        copyToChannel: vi.fn(),
        duration: 2 / 24_000,
      })),
      createBufferSource: vi.fn(() => ({
        buffer: null,
        connect: vi.fn(),
        onended: null,
        start: startSource,
      })),
      createMediaStreamSource: vi.fn(() => ({
        connect: vi.fn((node: unknown) => node),
        disconnect: vi.fn(),
      })),
      currentTime: 1,
      destination: {},
      onstatechange: null,
      resume: vi.fn(async () => {}),
      sampleRate: 24_000,
      state: "running",
    };
    vi.stubGlobal(
      "AudioContext",
      vi.fn(function AudioContextMock() {
        return context;
      }),
    );
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({
          getAudioTracks: () => [{}],
          getTracks: () => [{ stop: vi.fn() }],
        })),
      },
    });
    vi.stubGlobal(
      "AudioWorkletNode",
      vi.fn(function AudioWorkletNodeMock() {
        return {
          connect: vi.fn(() => ({ connect: vi.fn() })),
          disconnect: vi.fn(),
          port: { onmessage: null },
        };
      }),
    );
    let socket: MockPlaybackWebSocket | null = null;
    class MockPlaybackWebSocket {
      static OPEN = 1;
      readyState = MockPlaybackWebSocket.OPEN;
      close = vi.fn();
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onopen: (() => void) | null = null;
      send = vi.fn();

      constructor() {
        socket = this;
      }
    }
    vi.stubGlobal("WebSocket", MockPlaybackWebSocket);
    const { result } = renderHook(() =>
      useAssemblyAiVoiceAgent({ windowLabel: "main" }),
    );

    await act(async () => result.current.start());
    const pcm = new Uint8Array([0, 0, 255, 127]);
    await act(async () => {
      socket?.onmessage?.({
        data: JSON.stringify({
          type: "reply.audio",
          data: btoa(String.fromCharCode(...pcm)),
        }),
      });
    });

    expect(startSource).toHaveBeenCalledWith(1);
    expect(recordStartupCheckpoint).toHaveBeenCalledWith({
      windowLabel: "main",
      checkpoint: "voice_agent_audio_playback_scheduled",
      detail: "samples=2_peak=1_state=running",
    });
  });

  it("executes and returns a tool result as soon as tool.call arrives", async () => {
    const socket = { send: vi.fn() } as unknown as WebSocket;
    const handlers = createHandlers();

    await handleAgentEvent(
      {
        type: "tool.call",
        call_id: "call-1",
        name: "tool_opaque",
        arguments: { path: "Desktop/Demo" },
      },
      socket,
      toolSession,
      handlers,
    );
    expect(executeVoiceAgentTool).toHaveBeenCalledWith({
      sessionId: "agent-session",
      revision: 1,
      alias: "tool_opaque",
      providerCallId: "call-1",
      arguments: { path: "Desktop/Demo" },
    });
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "tool.result",
        call_id: "call-1",
        result: JSON.stringify({
          status: "created",
          path: "Desktop/Demo",
        }),
        is_error: false,
      }),
    );
  });

  it("flushes queued playback when the user interrupts", async () => {
    const socket = { send: vi.fn() } as unknown as WebSocket;
    const handlers = createHandlers();

    await handleAgentEvent(
      { type: "reply.done", status: "interrupted" },
      socket,
      toolSession,
      handlers,
    );

    expect(executeVoiceAgentTool).not.toHaveBeenCalled();
    expect(handlers.flushPlayback).toHaveBeenCalledTimes(1);
  });

  it("holds an ask-policy tool result until the user resolves the approval", async () => {
    executeVoiceAgentTool.mockResolvedValue({
      status: "approvalRequired",
      approval: {
        approvalId: "approval_opaque",
        toolName: "windows_click",
        risk: "mutating",
      },
    });
    const socket = { send: vi.fn() } as unknown as WebSocket;
    const handlers = createHandlers();

    await handleAgentEvent(
      {
        type: "tool.call",
        call_id: "call-approval",
        name: "tool_opaque",
        arguments: { ref: "e1" },
      },
      socket,
      toolSession,
      handlers,
    );

    expect(socket.send).not.toHaveBeenCalled();
    expect(handlers.onApprovalRequired).toHaveBeenCalledWith({
      approvalId: "approval_opaque",
      toolName: "windows_click",
      risk: "mutating",
      callId: "call-approval",
      arguments: { ref: "e1" },
    });
  });
});

function createHandlers() {
  return {
    flushPlayback: vi.fn(),
    playAudio: vi.fn(),
    onEnded: vi.fn(),
    onError: vi.fn(),
    onReady: vi.fn(),
    onApprovalRequired: vi.fn(),
    isApprovalPending: vi.fn(() => false),
    setState: vi.fn(),
  };
}
