import type { FormEvent } from "react";

import { StatusBadge } from "@/components/app";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ProviderStatus } from "@/lib/tauri";

import { providerStatusLabel, providerStatusTone } from "./status";

type OpenAiProviderPanelProps = {
  apiKey: string;
  error?: string;
  isLoading: boolean;
  isSaving: boolean;
  isTesting: boolean;
  testResult?: string;
  status?: ProviderStatus;
  onApiKeyChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTest: () => void;
};

export function OpenAiProviderPanel({
  apiKey,
  error,
  isLoading,
  isSaving,
  isTesting,
  testResult,
  status,
  onApiKeyChange,
  onSubmit,
  onTest,
}: OpenAiProviderPanelProps) {
  return (
    <form onSubmit={onSubmit}>
      <FieldGroup className="rounded-lg border border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="text-base font-semibold">OpenAI</h3>
            <p className="text-sm text-muted-foreground">
              Use OpenAI hosted transcription models with your own API key.
            </p>
          </div>
          <StatusBadge tone={providerStatusTone(status)}>
            {providerStatusLabel(status)}
          </StatusBadge>
        </div>

        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="openai-api-key">API key</FieldLabel>
          <Input
            id="openai-api-key"
            type="password"
            autoComplete="off"
            placeholder={status?.configured ? "Key saved" : "sk-..."}
            value={apiKey}
            onChange={(event) => onApiKeyChange(event.target.value)}
            disabled={isLoading || isSaving}
            aria-invalid={Boolean(error)}
          />
          <FieldDescription>
            Stored in the operating system keychain and used only for local
            transcription requests.
          </FieldDescription>
          <FieldError>{error}</FieldError>
        </Field>

        {testResult ? (
          <p className="text-sm text-success" role="status">
            {testResult}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            className="w-fit"
            disabled={isLoading || isSaving || apiKey.trim().length === 0}
          >
            {isSaving ? "Saving..." : "Save and use OpenAI"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            disabled={isLoading || isSaving || isTesting}
            onClick={onTest}
          >
            {isTesting ? "Testing..." : "Test provider"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
