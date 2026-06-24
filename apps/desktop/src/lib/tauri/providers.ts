import { invokeTauri } from "./runtime";

export type ProviderStatus = {
  providerId: string;
  configured: boolean;
  configComplete: boolean;
};

export type ProviderConfig = {
  endpoint?: string;
  deploymentId?: string;
  streamingDeploymentId?: string;
  apiVersion?: string;
  model?: string;
};

export type TranscriptResult = {
  providerId: string;
  model: string;
  text: string;
  durationMs: number | null;
  providerRequestStartedAt?: string | null;
  providerResponseReceivedAt?: string | null;
  providerEvents?: ProviderTimelineEvent[];
};

export type ProviderTimelineEvent = {
  eventType: string;
  providerId: string;
  modelId?: string | null;
  providerMode: "async" | "streaming";
  sessionId?: string | null;
  stage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
  status?: string | null;
  errorCode?: string | null;
  bytesSent?: number | null;
  frameCount?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type StreamingProviderId =
  | "assemblyai"
  | "deepgram"
  | "elevenlabs"
  | "smallest";

export type StreamingProviderEvent = {
  eventType: "began" | "partial" | "final" | "terminated" | "error" | "ignored";
  sessionId?: string | null;
  turnOrder?: number | null;
  sequence?: number | null;
  text?: string | null;
  audioDurationMs?: number | null;
  sessionDurationMs?: number | null;
  providerEvents?: ProviderTimelineEvent[];
};

export type StreamingStartResult = {
  providerId: StreamingProviderId;
  modelId: string;
  providerMode: "streaming";
  providerEvents?: ProviderTimelineEvent[];
};

export type StreamingAudioWrite = {
  bytesSent: number;
  frameCount: number;
  droppedFrames: number;
};

export type AssemblyAiStreamingEvent = StreamingProviderEvent;
export type AssemblyAiStreamingStartResult = StreamingStartResult & {
  providerId: "assemblyai";
};
export type AssemblyAiStreamingAudioWrite = StreamingAudioWrite;
export type SmallestStreamingEvent = StreamingProviderEvent;
export type SmallestStreamingStartResult = StreamingStartResult & {
  providerId: "smallest";
};
export type SmallestStreamingAudioWrite = StreamingAudioWrite;
export type DeepgramStreamingEvent = StreamingProviderEvent;
export type DeepgramStreamingStartResult = StreamingStartResult & {
  providerId: "deepgram";
};
export type DeepgramStreamingAudioWrite = StreamingAudioWrite;
export type ElevenLabsStreamingEvent = StreamingProviderEvent;
export type ElevenLabsStreamingStartResult = StreamingStartResult & {
  providerId: "elevenlabs";
};
export type ElevenLabsStreamingAudioWrite = StreamingAudioWrite;

export type SpeechProviderId =
  | "openai"
  | "azure-openai"
  | "azure-ai-speech"
  | "assemblyai"
  | "deepgram"
  | "elevenlabs"
  | "smallest";

export const SPEECH_PROVIDER_CHANGED_EVENT =
  "vaak://speech-provider-changed";

export async function saveProviderKey(
  providerId: string,
  apiKey: string,
): Promise<ProviderStatus> {
  return invokeTauri("save_provider_key", { providerId, apiKey });
}

export async function saveProviderConfig(
  providerId: string,
  config: ProviderConfig,
): Promise<ProviderStatus> {
  return invokeTauri("save_provider_config", { providerId, config });
}

export async function saveSpeechProviderSetup(input: {
  providerId: SpeechProviderId;
  apiKey: string;
  config?: ProviderConfig;
  activate?: boolean;
}): Promise<ProviderStatus> {
  return invokeTauri("save_speech_provider_setup", {
    providerId: input.providerId,
    apiKey: input.apiKey,
    config: input.config,
    activate: input.activate ?? false,
  });
}

export async function getProviderConfig(
  providerId: string,
): Promise<ProviderConfig | null> {
  return invokeTauri("get_provider_config", { providerId });
}

export async function getProviderStatus(
  providerId: string,
): Promise<ProviderStatus> {
  return invokeTauri("get_provider_status", { providerId });
}

export async function testSpeechProvider(
  providerId: SpeechProviderId,
): Promise<ProviderStatus> {
  return invokeTauri("test_speech_provider", { providerId });
}

export async function saveSelectedSpeechProvider(
  providerId: SpeechProviderId,
): Promise<SpeechProviderId> {
  return invokeTauri("save_selected_speech_provider", { providerId });
}

export async function getSelectedSpeechProvider(): Promise<SpeechProviderId> {
  return invokeTauri("get_selected_speech_provider");
}

export async function transcribeRecording(input: {
  providerId: string;
  audioBlob: Blob;
  language?: string;
  prompt?: string;
  model?: string;
}): Promise<TranscriptResult> {
  const buffer = await input.audioBlob.arrayBuffer();
  const audioBytes = Array.from(new Uint8Array(buffer));

  return invokeTauri("transcribe_recording", {
    providerId: input.providerId,
    audioBytes,
    mimeType: input.audioBlob.type || "audio/webm",
    language: input.language,
    prompt: input.prompt,
    model: input.model,
  });
}

export async function startAssemblyAiStreamingSession(input: {
  onEvent: (event: AssemblyAiStreamingEvent) => void;
}): Promise<AssemblyAiStreamingStartResult> {
  const { Channel } = await import("@tauri-apps/api/core");
  const events = new Channel<AssemblyAiStreamingEvent>();
  events.onmessage = input.onEvent;

  return invokeTauri("start_assemblyai_streaming_session", { events });
}

export async function sendAssemblyAiStreamingAudio(
  audioBytes: Uint8Array,
): Promise<AssemblyAiStreamingAudioWrite> {
  return invokeTauri("send_assemblyai_streaming_audio", {
    audioBytes: Array.from(audioBytes),
  });
}

export async function stopAssemblyAiStreamingSession(): Promise<boolean> {
  return invokeTauri("stop_assemblyai_streaming_session");
}

export async function cleanupAssemblyAiStreamingSessions(): Promise<boolean> {
  return invokeTauri("cleanup_assemblyai_streaming_sessions");
}

export async function startDeepgramStreamingSession(input: {
  onEvent: (event: DeepgramStreamingEvent) => void;
}): Promise<DeepgramStreamingStartResult> {
  const { Channel } = await import("@tauri-apps/api/core");
  const events = new Channel<DeepgramStreamingEvent>();
  events.onmessage = input.onEvent;

  return invokeTauri("start_deepgram_streaming_session", { events });
}

export async function sendDeepgramStreamingAudio(
  audioBytes: Uint8Array,
): Promise<DeepgramStreamingAudioWrite> {
  return invokeTauri("send_deepgram_streaming_audio", {
    audioBytes: Array.from(audioBytes),
  });
}

export async function stopDeepgramStreamingSession(): Promise<boolean> {
  return invokeTauri("stop_deepgram_streaming_session");
}

export async function cleanupDeepgramStreamingSessions(): Promise<boolean> {
  return invokeTauri("cleanup_deepgram_streaming_sessions");
}

export async function startElevenLabsStreamingSession(input: {
  onEvent: (event: ElevenLabsStreamingEvent) => void;
}): Promise<ElevenLabsStreamingStartResult> {
  const { Channel } = await import("@tauri-apps/api/core");
  const events = new Channel<ElevenLabsStreamingEvent>();
  events.onmessage = input.onEvent;

  return invokeTauri("start_elevenlabs_streaming_session", { events });
}

export async function sendElevenLabsStreamingAudio(
  audioBytes: Uint8Array,
): Promise<ElevenLabsStreamingAudioWrite> {
  return invokeTauri("send_elevenlabs_streaming_audio", {
    audioBytes: Array.from(audioBytes),
  });
}

export async function stopElevenLabsStreamingSession(): Promise<boolean> {
  return invokeTauri("stop_elevenlabs_streaming_session");
}

export async function cleanupElevenLabsStreamingSessions(): Promise<boolean> {
  return invokeTauri("cleanup_elevenlabs_streaming_sessions");
}

export async function startSmallestStreamingSession(input: {
  onEvent: (event: SmallestStreamingEvent) => void;
}): Promise<SmallestStreamingStartResult> {
  const { Channel } = await import("@tauri-apps/api/core");
  const events = new Channel<SmallestStreamingEvent>();
  events.onmessage = input.onEvent;

  return invokeTauri("start_smallest_streaming_session", { events });
}

export async function sendSmallestStreamingAudio(
  audioBytes: Uint8Array,
): Promise<SmallestStreamingAudioWrite> {
  return invokeTauri("send_smallest_streaming_audio", {
    audioBytes: Array.from(audioBytes),
  });
}

export async function stopSmallestStreamingSession(): Promise<boolean> {
  return invokeTauri("stop_smallest_streaming_session");
}

export async function cleanupSmallestStreamingSessions(): Promise<boolean> {
  return invokeTauri("cleanup_smallest_streaming_sessions");
}
