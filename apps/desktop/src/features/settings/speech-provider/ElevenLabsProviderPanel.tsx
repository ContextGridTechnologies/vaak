import type { FormEvent } from "react";

import { StatusBadge } from "@/components/app";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProviderStatus } from "@/lib/tauri";

import { providerStatusLabel, providerStatusTone } from "./status";
import {
  ELEVENLABS_MODELS,
  SAVED_KEY_PLACEHOLDER,
} from "./types";

type ElevenLabsProviderPanelProps = {
  apiKey: string;
  error?: string;
  isLoading: boolean;
  isSaving: boolean;
  isTesting: boolean;
  model: string;
  showTestButton?: boolean;
  testResult?: string;
  status?: ProviderStatus;
  onApiKeyChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTest: () => void;
};

export function ElevenLabsProviderPanel({
  apiKey,
  error,
  isLoading,
  isSaving,
  isTesting,
  model,
  showTestButton = true,
  testResult,
  status,
  onApiKeyChange,
  onModelChange,
  onSubmit,
  onTest,
}: ElevenLabsProviderPanelProps) {
  const disabled =
    isLoading ||
    isSaving ||
    isTesting ||
    (apiKey.trim().length === 0 && !status?.configured);

  return (
    <form onSubmit={onSubmit}>
      <FieldGroup className="rounded-lg border border-primary/30 bg-card/70 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="text-base font-semibold">ElevenLabs</h3>
            <p className="text-sm text-muted-foreground">
              Use ElevenLabs Scribe transcription with your own API key.
            </p>
          </div>
          <StatusBadge tone={providerStatusTone(status)}>
            {providerStatusLabel(status)}
          </StatusBadge>
        </div>

        <Field
          className="gap-2 md:grid md:grid-cols-[9rem_1fr] md:items-center"
        >
          <FieldLabel htmlFor="elevenlabs-model">Model</FieldLabel>
          <Select value={model} onValueChange={onModelChange} disabled={isLoading || isSaving}>
            <SelectTrigger id="elevenlabs-model" aria-label="Model" className="w-full">
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>
              {ELEVENLABS_MODELS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          data-invalid={Boolean(error)}
          className="gap-2 md:grid md:grid-cols-[9rem_1fr] md:items-start"
        >
          <FieldLabel htmlFor="elevenlabs-api-key">API key</FieldLabel>
          <div className="flex flex-col gap-2">
            <Input
              id="elevenlabs-api-key"
              type="password"
              autoComplete="off"
              placeholder={status?.configured ? SAVED_KEY_PLACEHOLDER : "ElevenLabs API key"}
              value={apiKey}
              onChange={(event) => onApiKeyChange(event.target.value)}
              disabled={isLoading || isSaving}
              aria-invalid={Boolean(error)}
            />
            <FieldError>{error}</FieldError>
          </div>
        </Field>

        {testResult ? (
          <p className="text-sm text-success" role="status">
            {testResult}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 md:pl-[9rem]">
          <Button
            type="submit"
            className="w-fit"
            disabled={disabled}
          >
            {isSaving ? "Saving..." : "Save and use ElevenLabs"}
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
    </form>
  );
}
