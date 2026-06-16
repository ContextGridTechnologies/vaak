import { invokeTauri } from "./runtime";

export type ProviderStatus = {
  providerId: string;
  configured: boolean;
  configComplete: boolean;
};

export type ProviderConfig = {
  endpoint?: string;
  deploymentId?: string;
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

export type AssemblyAiStreamingEvent = {
  eventType: "began" | "partial" | "final" | "terminated" | "error" | "ignored";
  sessionId?: string | null;
  turnOrder?: number | null;
  text?: string | null;
  audioDurationMs?: number | null;
  sessionDurationMs?: number | null;
  providerEvents?: ProviderTimelineEvent[];
};

export type AssemblyAiStreamingStartResult = {
  providerId: "assemblyai";
  modelId: string;
  providerMode: "streaming";
  providerEvents?: ProviderTimelineEvent[];
};

export type AssemblyAiStreamingAudioWrite = {
  bytesSent: number;
  frameCount: number;
  droppedFrames: number;
};

export type SpeechProviderId =
  | "openai"
  | "azure-openai"
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
