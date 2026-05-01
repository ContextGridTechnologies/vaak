import { normalizeError } from "@/lib/errors";
import type { ProviderStatus, SpeechProviderId } from "@/lib/tauri";

import { providerLabels } from "./types";

export function providerStatusLabel(
  status: ProviderStatus | undefined,
): string {
  if (!status?.configured) {
    return "Needs key";
  }
  if (!status.configComplete) {
    return "Needs configuration";
  }
  return "Ready";
}

export function providerStatusTone(
  status: ProviderStatus | undefined,
): "success" | "warning" {
  return status?.configured && status.configComplete ? "success" : "warning";
}

export function normalizeProviderError(
  providerId: SpeechProviderId,
  err: unknown,
) {
  const message = normalizeError(err);
  if (message.includes("missing_provider_key")) {
    return `${providerLabels[providerId]} key is not saved. Enter the API key and save again.`;
  }
  if (message.includes("missing_provider_config")) {
    return `${providerLabels[providerId]} configuration is incomplete.`;
  }
  return message;
}
