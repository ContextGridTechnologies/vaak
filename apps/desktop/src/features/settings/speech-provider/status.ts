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
  if (message.includes("provider_auth_failed")) {
    return `${providerLabels[providerId]} rejected the saved API key. Check the key and save it again.`;
  }
  if (message.includes("provider_permission_failed")) {
    return `${providerLabels[providerId]} rejected access for this key. Check workspace, product, or plan permissions.`;
  }
  if (message.includes("provider_quota_exhausted")) {
    return `${providerLabels[providerId]} account balance or usage limit is exhausted. Check billing, credits, or workspace limits.`;
  }
  if (message.includes("provider_bad_request")) {
    return `${providerLabels[providerId]} rejected the audio request. Try a fresh recording or a shorter sample.`;
  }
  if (message.includes("provider_rate_limited")) {
    return `${providerLabels[providerId]} is rate-limiting requests. ${retryGuidance(message)}`;
  }
  if (message.includes("provider_upstream_failed")) {
    return `${providerLabels[providerId]} is temporarily unavailable. Try again shortly.`;
  }
  return message;
}

function retryGuidance(message: string): string {
  const match = message.match(/Try again in [^.]+\./);
  return match?.[0] ?? "Wait a moment and try again.";
}
