import type { ProviderStatus, SpeechProviderId } from "@/lib/tauri";

export const AZURE_OPENAI_API_VERSION = "2025-04-01-preview";
export const SAVED_KEY_PLACEHOLDER = "************";
export const OPENAI_MODELS = [
  {
    value: "gpt-4o-mini-transcribe",
    label: "GPT-4o mini Transcribe",
  },
  {
    value: "gpt-4o-transcribe",
    label: "GPT-4o Transcribe",
  },
  {
    value: "gpt-4o-transcribe-diarize",
    label: "GPT-4o Transcribe Diarize",
  },
  {
    value: "whisper-1",
    label: "Whisper-1",
  },
] as const;
export const ASSEMBLYAI_MODELS = [
  {
    value: "universal-3-pro",
    label: "Universal-3 Pro",
  },
  {
    value: "universal-2",
    label: "Universal-2",
  },
] as const;
export const ELEVENLABS_MODELS = [
  {
    value: "scribe_v2",
    label: "Scribe v2",
  },
  {
    value: "scribe_v1",
    label: "Scribe v1",
  },
] as const;
export const DEFAULT_OPENAI_MODEL = OPENAI_MODELS[0].value;
export const DEFAULT_ASSEMBLYAI_MODEL = ASSEMBLYAI_MODELS[0].value;
export const DEFAULT_ELEVENLABS_MODEL = ELEVENLABS_MODELS[0].value;
export const DEFAULT_DEEPGRAM_MODEL = "nova-3";
export const DEFAULT_SMALLEST_MODEL = "pulse";

export const providerLabels: Record<SpeechProviderId, string> = {
  openai: "OpenAI",
  "azure-openai": "Azure OpenAI",
  assemblyai: "AssemblyAI",
  deepgram: "Deepgram",
  elevenlabs: "ElevenLabs",
  smallest: "Smallest AI",
};

export type ProviderErrors = Partial<Record<SpeechProviderId, string>>;

export type ProviderStatuses = Partial<Record<SpeechProviderId, ProviderStatus>>;
