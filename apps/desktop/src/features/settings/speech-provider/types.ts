import type { ProviderStatus, SpeechProviderId } from "@/lib/tauri";

export const AZURE_OPENAI_API_VERSION = "2025-04-01-preview";
export const SAVED_KEY_PLACEHOLDER = "************";

export const providerLabels: Record<SpeechProviderId, string> = {
  openai: "OpenAI",
  "azure-openai": "Azure OpenAI",
};

export type ProviderErrors = Partial<Record<SpeechProviderId, string>>;

export type ProviderStatuses = Partial<Record<SpeechProviderId, ProviderStatus>>;
