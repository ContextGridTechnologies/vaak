import type { FormEvent } from "react";

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

import { OPENAI_MODELS, SAVED_KEY_PLACEHOLDER } from "./types";

type OpenAiProviderPanelProps = {
  apiKey: string;
  error?: string;
  headerMeta?: string;
  isLoading: boolean;
  isSaving: boolean;
  isTesting: boolean;
  model: string;
  showTestButton?: boolean;
  status?: ProviderStatus;
  onApiKeyChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTest: () => void;
};

export function OpenAiProviderPanel({
  apiKey,
  error,
  headerMeta,
  isLoading,
  isSaving,
  isTesting,
  model,
  showTestButton = true,
  status,
  onApiKeyChange,
  onModelChange,
  onSubmit,
  onTest,
}: OpenAiProviderPanelProps) {
  const disabled =
    isLoading ||
    isSaving ||
    isTesting ||
    (apiKey.trim().length === 0 && !status?.configured);

  return (
    <form onSubmit={onSubmit}>
      <FieldGroup className="gap-4 rounded-lg bg-muted/45 p-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <h3 className="text-base font-semibold">OpenAI</h3>
          {headerMeta ? (
            <p className="text-right text-xs font-medium text-muted-foreground">
              {headerMeta}
            </p>
          ) : null}
        </div>

        <Field
          className="gap-2 md:grid md:grid-cols-[9rem_1fr] md:items-center"
        >
          <FieldLabel htmlFor="openai-model">Model</FieldLabel>
          <Select value={model} onValueChange={onModelChange} disabled={isLoading || isSaving}>
            <SelectTrigger id="openai-model" aria-label="Model" className="w-full">
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>
              {OPENAI_MODELS.map((option) => (
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
          <FieldLabel htmlFor="openai-api-key">API key</FieldLabel>
          <div className="flex flex-col gap-2">
            <Input
              id="openai-api-key"
              type="password"
              autoComplete="off"
              placeholder={status?.configured ? SAVED_KEY_PLACEHOLDER : "sk-..."}
              value={apiKey}
              onChange={(event) => onApiKeyChange(event.target.value)}
              disabled={isLoading || isSaving}
              aria-invalid={Boolean(error)}
            />
            <FieldError>{error}</FieldError>
          </div>
        </Field>

        <div className="flex flex-wrap gap-2 md:pl-[9rem]">
          <Button
            type="submit"
            className="w-fit"
            disabled={disabled}
          >
            {isSaving ? "Saving..." : "Save and use OpenAI"}
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
