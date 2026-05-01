import type { ProviderStatus } from "@/lib/tauri";

export function openAiNeedsKeyStatus(): ProviderStatus {
  return {
    providerId: "openai",
    configured: false,
    configComplete: true,
  };
}

export function azureReadyStatus(): ProviderStatus {
  return {
    providerId: "azure-openai",
    configured: true,
    configComplete: true,
  };
}
