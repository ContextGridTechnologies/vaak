import { useCallback, useEffect, useRef, useState } from "react";

import {
  executeVoiceAgentTool,
  getAssemblyAiVoiceAgentToken,
  recordStartupCheckpoint,
  releaseVoiceAgentToolSnapshot,
  resolveVoiceAgentToolApproval,
  type VoiceAgentToolApproval,
  type VoiceAgentToolSnapshot,
} from "@/lib/tauri";
import {
  createAssemblyAiSessionUpdate,
  decodePcm16Base64,
  encodePcm16Base64,
} from "./assemblyAiVoiceAgentProtocol";

export type VoiceAgentState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "working"
  | "approval"
  | "ending"
  | "error";

export type PendingVoiceAgentApproval = VoiceAgentToolApproval & {
  callId: string;
  arguments: Record<string, unknown>;
};

const SAMPLE_RATE = 24_000;
const WORKLET_URL = "/voiceAgentPcmProcessor.js";
const WORKLET_NAME = "vaak-voice-agent-pcm";

type UseAssemblyAiVoiceAgentOptions = {
  windowLabel?: "main" | "voice-capsule";
};

export function useAssemblyAiVoiceAgent({
  windowLabel = "voice-capsule",
}: UseAssemblyAiVoiceAgentOptions = {}) {
  const [state, setState] = useState<VoiceAgentState>("idle");
  const [errorMessage, setErrorMessage] = useState("Voice agent failed.");
  const [pendingApproval, setPendingApproval] =
    useState<PendingVoiceAgentApproval | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const playbackRef = useRef(new Set<AudioBufferSourceNode>());
  const playbackTimeRef = useRef(0);
  const playbackLoggedRef = useRef(false);
  const toolSessionRef = useRef<VoiceAgentToolSnapshot | null>(null);
  const approvalPendingRef = useRef(false);
  const readyRef = useRef(false);
  const endingRef = useRef(false);
  const generationRef = useRef(0);
  const stopTimerRef = useRef<number | null>(null);

  const flushPlayback = useCallback(() => {
    for (const source of playbackRef.current) {
      try {
        source.stop();
      } catch {
        // The source may already have ended.
      }
    }
    playbackRef.current.clear();
    playbackTimeRef.current = contextRef.current?.currentTime ?? 0;
  }, []);

  const cleanup = useCallback(() => {
    generationRef.current += 1;
    readyRef.current = false;
    endingRef.current = false;
    approvalPendingRef.current = false;
    playbackLoggedRef.current = false;
    setPendingApproval(null);
    const toolSession = toolSessionRef.current;
    toolSessionRef.current = null;
    if (toolSession) {
      void releaseVoiceAgentToolSnapshot(toolSession.sessionId).catch(() => {});
    }
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    flushPlayback();
    workletRef.current?.disconnect();
    workletRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
    }
    const context = contextRef.current;
    contextRef.current = null;
    if (context && context.state !== "closed") {
      context.onstatechange = null;
      void context.close();
    }
  }, [flushPlayback]);

  const fail = useCallback(
    (error: unknown) => {
      recordVoiceAgentCheckpoint(windowLabel, "voice_agent_failed", {
        message: getErrorMessage(error),
      });
      cleanup();
      setState("error");
      const message = getErrorMessage(error);
      setErrorMessage(message);
    },
    [cleanup, windowLabel],
  );

  const playAudio = useCallback((encoded: string) => {
    const context = contextRef.current;
    if (!context) {
      return;
    }
    const bytes = decodePcm16Base64(encoded);
    const sampleCount = Math.floor(bytes.byteLength / 2);
    const samples = new Float32Array(sampleCount);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let peak = 0;
    for (let index = 0; index < sampleCount; index += 1) {
      samples[index] = view.getInt16(index * 2, true) / 0x8000;
      peak = Math.max(peak, Math.abs(samples[index]));
    }
    const buffer = context.createBuffer(1, sampleCount, SAMPLE_RATE);
    buffer.copyToChannel(samples, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const startsAt = Math.max(context.currentTime, playbackTimeRef.current);
    playbackTimeRef.current = startsAt + buffer.duration;
    playbackRef.current.add(source);
    source.onended = () => playbackRef.current.delete(source);
    source.start(startsAt);
    if (!playbackLoggedRef.current) {
      playbackLoggedRef.current = true;
      recordVoiceAgentCheckpoint(windowLabel, "voice_agent_audio_playback_scheduled", {
        samples: sampleCount,
        peak: Math.round(peak * 1_000) / 1_000,
        state: context.state,
      });
    }
  }, [windowLabel]);

  const start = useCallback(async () => {
    if (socketRef.current || state === "connecting") {
      return;
    }

    cleanup();
    const generation = generationRef.current;
    recordVoiceAgentCheckpoint(windowLabel, "voice_agent_start_requested");
    setErrorMessage("Voice agent failed.");
    setState("connecting");
    try {
      const context = new AudioContext({ sampleRate: SAMPLE_RATE });
      contextRef.current = context;
      context.onstatechange = () => {
        recordVoiceAgentCheckpoint(windowLabel, "voice_agent_audio_context_changed", {
          state: context.state,
        });
        if (
          contextRef.current === context &&
          context.state === "suspended" &&
          !endingRef.current
        ) {
          void context.resume().catch((error) => {
            if (
              contextRef.current === context &&
              generationRef.current === generation &&
              !endingRef.current
            ) {
              fail(error);
            }
          });
        }
      };
      await context.resume();
      recordVoiceAgentCheckpoint(windowLabel, "voice_agent_audio_context_ready", {
        sampleRate: context.sampleRate,
        state: context.state,
      });
      if (generation !== generationRef.current) {
        return;
      }

      const { token, session } = await getAssemblyAiVoiceAgentToken();
      recordVoiceAgentCheckpoint(windowLabel, "voice_agent_token_received");
      if (generation !== generationRef.current) {
        void releaseVoiceAgentToolSnapshot(session.sessionId).catch(() => {});
        return;
      }
      toolSessionRef.current = session;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: SAMPLE_RATE,
        },
      });
      recordVoiceAgentCheckpoint(windowLabel, "voice_agent_microphone_ready", {
        tracks: stream.getAudioTracks().length,
      });
      if (generation !== generationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;

      await context.audioWorklet.addModule(WORKLET_URL);
      recordVoiceAgentCheckpoint(windowLabel, "voice_agent_audio_worklet_ready");
      if (generation !== generationRef.current) {
        return;
      }

      const source = context.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(context, WORKLET_NAME);
      source.connect(worklet).connect(context.destination);
      sourceRef.current = source;
      workletRef.current = worklet;
      playbackTimeRef.current = context.currentTime;

      const url = new URL("wss://agents.assemblyai.com/v1/ws");
      url.searchParams.set("token", token);
      const socket = new WebSocket(url);
      socketRef.current = socket;
      let receivedReplyAudio = false;

      worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (readyRef.current && socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: "input.audio",
              audio: encodePcm16Base64(new Uint8Array(event.data)),
            }),
          );
        }
      };

      socket.onopen = () => {
        recordVoiceAgentCheckpoint(windowLabel, "voice_agent_socket_opened");
        if (endingRef.current) {
          socket.send(JSON.stringify({ type: "session.end" }));
          return;
        }
        socket.send(
          JSON.stringify(
            createAssemblyAiSessionUpdate(session.tools, session.instructions),
          ),
        );
      };
      socket.onmessage = (event) => {
        try {
          const agentEvent = JSON.parse(String(event.data)) as Record<
            string,
            unknown
          >;
          if (agentEvent.type === "session.ready") {
            recordVoiceAgentCheckpoint(windowLabel, "voice_agent_session_ready");
          } else if (
            agentEvent.type === "reply.audio" &&
            !receivedReplyAudio &&
            typeof agentEvent.data === "string"
          ) {
            receivedReplyAudio = true;
            recordVoiceAgentCheckpoint(windowLabel, "voice_agent_reply_audio_received", {
              encodedChars: agentEvent.data.length,
            });
          } else if (agentEvent.type === "tool.call") {
            recordVoiceAgentCheckpoint(windowLabel, "voice_agent_tool_call_received", {
              name:
                typeof agentEvent.name === "string"
                  ? agentEvent.name
                  : "unknown",
            });
          } else if (agentEvent.type === "reply.done") {
            recordVoiceAgentCheckpoint(windowLabel, "voice_agent_reply_completed", {
              status:
                typeof agentEvent.status === "string"
                  ? agentEvent.status
                  : "completed",
            });
          }
          void handleAgentEvent(
            agentEvent,
            socket,
            session,
            {
              flushPlayback,
              playAudio,
              onEnded: () => {
                cleanup();
                setState("idle");
              },
              onError: fail,
              onApprovalRequired: (approval) => {
                approvalPendingRef.current = true;
                setPendingApproval(approval);
                setState("approval");
              },
              isApprovalPending: () => approvalPendingRef.current,
              onReady: () => {
                readyRef.current = true;
                setState("listening");
              },
              setState,
            },
          ).catch(fail);
        } catch {
          fail("AssemblyAI returned an invalid event.");
        }
      };
      socket.onerror = () => fail("Could not connect to AssemblyAI.");
      socket.onclose = () => {
        if (socketRef.current === socket && !endingRef.current) {
          fail("The AssemblyAI voice session disconnected.");
        }
      };
    } catch (error) {
      if (generation === generationRef.current) {
        fail(error);
      }
    }
  }, [cleanup, fail, flushPlayback, playAudio, state, windowLabel]);

  const stop = useCallback(async () => {
    recordVoiceAgentCheckpoint(windowLabel, "voice_agent_stop_requested");
    const socket = socketRef.current;
    if (!socket) {
      cleanup();
      setState("idle");
      return;
    }
    readyRef.current = false;
    endingRef.current = true;
    setState("ending");
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "session.end" }));
    }
    stopTimerRef.current = window.setTimeout(() => {
      cleanup();
      setState("idle");
    }, 2_000);
  }, [cleanup, windowLabel]);

  const respondToApproval = useCallback(
    async (approved: boolean) => {
      const approval = pendingApproval;
      const session = toolSessionRef.current;
      const socket = socketRef.current;
      if (!approval || !session || !socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }
      approvalPendingRef.current = false;
      setPendingApproval(null);
      setState("working");
      try {
        const result = await resolveVoiceAgentToolApproval({
          sessionId: session.sessionId,
          approvalId: approval.approvalId,
          approved,
        });
        socket.send(
          JSON.stringify({
            type: "tool.result",
            call_id: approval.callId,
            result: JSON.stringify(result),
            is_error: false,
          }),
        );
        setState("listening");
      } catch (error) {
        socket.send(
          JSON.stringify({
            type: "tool.result",
            call_id: approval.callId,
            result: JSON.stringify({ error: getErrorMessage(error) }),
            is_error: true,
          }),
        );
        fail(error);
      }
    },
    [fail, pendingApproval],
  );

  useEffect(() => cleanup, [cleanup]);

  return {
    isActive: state !== "idle" && state !== "error",
    message: state === "error" ? errorMessage : getStateMessage(state),
    pendingApproval,
    respondToApproval,
    start,
    state,
    stop,
  };
}

export async function handleAgentEvent(
  event: Record<string, unknown>,
  socket: WebSocket,
  toolSession: VoiceAgentToolSnapshot,
  handlers: {
    flushPlayback: () => void;
    playAudio: (encoded: string) => void;
    onEnded: () => void;
    onError: (error: unknown) => void;
    onApprovalRequired: (approval: PendingVoiceAgentApproval) => void;
    isApprovalPending: () => boolean;
    onReady: () => void;
    setState: (state: VoiceAgentState) => void;
  },
) {
  switch (event.type) {
    case "session.ready":
      handlers.onReady();
      break;
    case "input.speech.started":
      handlers.setState("listening");
      break;
    case "input.speech.stopped":
      handlers.setState("thinking");
      break;
    case "reply.started":
      handlers.setState("speaking");
      break;
    case "reply.audio":
      if (typeof event.data === "string") {
        handlers.playAudio(event.data);
      }
      break;
    case "tool.call":
      if (
        typeof event.call_id === "string" &&
        typeof event.name === "string" &&
        isRecord(event.arguments)
      ) {
        handlers.setState("working");
        try {
          const result = await executeVoiceAgentTool({
            sessionId: toolSession.sessionId,
            revision: toolSession.revision,
            alias: event.name,
            providerCallId: event.call_id,
            arguments: event.arguments,
          });
          if (isApprovalRequiredResult(result)) {
            handlers.onApprovalRequired({
              ...result.approval,
              callId: event.call_id,
              arguments: event.arguments,
            });
            break;
          }
          socket.send(
            JSON.stringify({
              type: "tool.result",
              call_id: event.call_id,
              result: JSON.stringify(result),
              is_error: false,
            }),
          );
        } catch (error) {
          socket.send(
            JSON.stringify({
              type: "tool.result",
              call_id: event.call_id,
              result: JSON.stringify({ error: getErrorMessage(error) }),
              is_error: true,
            }),
          );
        }
      }
      break;
    case "reply.done":
      if (event.status === "interrupted") {
        handlers.flushPlayback();
      }
      if (!handlers.isApprovalPending()) {
        handlers.setState("listening");
      }
      break;
    case "session.ended":
      handlers.onEnded();
      break;
    case "session.error":
      handlers.onError(
        typeof event.message === "string" ? event.message : "Voice session failed.",
      );
      break;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isApprovalRequiredResult(value: unknown): value is {
  status: "approvalRequired";
  approval: VoiceAgentToolApproval;
} {
  if (!isRecord(value) || value.status !== "approvalRequired" || !isRecord(value.approval)) {
    return false;
  }
  return (
    typeof value.approval.approvalId === "string" &&
    typeof value.approval.toolName === "string" &&
    typeof value.approval.risk === "string"
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }
  return typeof error === "string" ? error : "Voice agent failed.";
}

function recordVoiceAgentCheckpoint(
  windowLabel: "main" | "voice-capsule",
  checkpoint: string,
  detail?: Record<string, unknown>,
) {
  const normalizedDetail = detail
    ? Object.entries(detail)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join("_")
    : undefined;
  void recordStartupCheckpoint({
    windowLabel,
    checkpoint,
    ...(normalizedDetail === undefined ? {} : { detail: normalizedDetail }),
  }).catch(() => {});
}

function getStateMessage(state: VoiceAgentState): string {
  switch (state) {
    case "idle":
      return "Voice agent ready.";
    case "connecting":
      return "Connecting voice agent...";
    case "listening":
      return "Voice agent is listening.";
    case "thinking":
      return "Voice agent is thinking.";
    case "speaking":
      return "Voice agent is speaking.";
    case "working":
      return "Voice agent is working.";
    case "approval":
      return "Voice agent needs approval.";
    case "ending":
      return "Ending voice agent session...";
    case "error":
      return "Voice agent unavailable. Press again to retry.";
  }
}
