import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ProviderStatus } from "@/lib/tauri";

import { SAVED_KEY_PLACEHOLDER } from "./types";

type AzureAiSpeechProviderPanelProps = {
  apiKey: string;
  endpoint: string;
  error?: string;
  headerMeta?: string;
  isLoading: boolean;
  isSaving: boolean;
  isTesting: boolean;
  showTestButton?: boolean;
  status?: ProviderStatus;
  onApiKeyChange: (value: string) => void;
  onEndpointChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTest: () => void;
};

export function AzureAiSpeechProviderPanel({
  apiKey,
  endpoint,
  error,
  headerMeta,
  isLoading,
  isSaving,
  isTesting,
  showTestButton = true,
  status,
  onApiKeyChange,
  onEndpointChange,
  onSubmit,
  onTest,
}: AzureAiSpeechProviderPanelProps) {
  const disabled =
    isLoading ||
    isSaving ||
    isTesting ||
    endpoint.trim().length === 0 ||
    (apiKey.trim().length === 0 && !status?.configured);

  return (
    <form onSubmit={onSubmit}>
      <FieldGroup className="gap-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <h3 className="text-base font-semibold">Azure AI Speech</h3>
          {headerMeta ? (
            <p className="text-right text-sm font-medium text-muted-foreground">
              {headerMeta}
            </p>
          ) : null}
        </div>

        <div className="rounded-md border border-border/70 bg-background/70 p-4">
          <FieldGroup className="gap-4">
            <Field className="gap-2 md:grid md:grid-cols-[9rem_1fr] md:items-center">
              <FieldLabel htmlFor="azure-ai-speech-endpoint">Endpoint</FieldLabel>
              <Input
                id="azure-ai-speech-endpoint"
                type="url"
                placeholder="https://your-resource.cognitiveservices.azure.com"
                value={endpoint}
                onChange={(event) => onEndpointChange(event.target.value)}
                disabled={isLoading || isSaving}
              />
            </Field>

            <Field
              data-invalid={Boolean(error)}
              className="gap-2 md:grid md:grid-cols-[9rem_1fr] md:items-start"
            >
              <FieldLabel htmlFor="azure-ai-speech-api-key">API key</FieldLabel>
              <div className="flex flex-col gap-2">
                <Input
                  id="azure-ai-speech-api-key"
                  type="password"
                  autoComplete="off"
                  placeholder={status?.configured ? SAVED_KEY_PLACEHOLDER : "Azure AI Speech key"}
                  value={apiKey}
                  onChange={(event) => onApiKeyChange(event.target.value)}
                  disabled={isLoading || isSaving}
                  aria-invalid={Boolean(error)}
                />
                <FieldError>{error}</FieldError>
              </div>
            </Field>

            <div className="flex flex-wrap gap-2 md:pl-[9rem]">
              <Button type="submit" className="w-fit" disabled={disabled}>
                {isSaving ? "Saving..." : "Save and use Azure AI Speech"}
              </Button>
              {showTestButton ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-fit"
                  disabled={isLoading || isSaving || isTesting}
                  onClick={onTest}
                >
                  {isTesting ? "Testing..." : "Test provider"}
                </Button>
              ) : null}
            </div>
          </FieldGroup>
        </div>
      </FieldGroup>
    </form>
  );
}
