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
};

export type SpeechProviderId = "openai" | "azure-openai" | "elevenlabs";

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
