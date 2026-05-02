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

import { SAVED_KEY_PLACEHOLDER } from "./types";

type AzureOpenAiProviderPanelProps = {
  apiKey: string;
  apiVersion: string;
  deploymentId: string;
  endpoint: string;
  error?: string;
  hasSavedKey: boolean;
  isLoading: boolean;
  isSaving: boolean;
  isTesting: boolean;
  showTestButton?: boolean;
  testResult?: string;
  onApiKeyChange: (value: string) => void;
  onApiVersionChange: (value: string) => void;
  onDeploymentIdChange: (value: string) => void;
  onEndpointChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTest: () => void;
};

export function AzureOpenAiProviderPanel({
  apiKey,
  apiVersion,
  deploymentId,
  endpoint,
  error,
  hasSavedKey,
  isLoading,
  isSaving,
  isTesting,
  showTestButton = true,
  testResult,
  onApiKeyChange,
  onApiVersionChange,
  onDeploymentIdChange,
  onEndpointChange,
  onSubmit,
  onTest,
}: AzureOpenAiProviderPanelProps) {
  const disabled =
    isLoading ||
    isSaving ||
    isTesting ||
    endpoint.trim().length === 0 ||
    deploymentId.trim().length === 0;

  return (
    <form onSubmit={onSubmit}>
      <FieldGroup className="rounded-lg border border-primary/30 bg-card/70 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="text-base font-semibold">Azure OpenAI</h3>
            <p className="text-sm text-muted-foreground">
              Use an Azure OpenAI transcription deployment with local
              credentials.
            </p>
          </div>
          <StatusBadge tone={hasSavedKey ? "success" : "warning"}>
            {hasSavedKey ? "Key saved" : "Needs key"}
          </StatusBadge>
        </div>

        <FieldGroup className="gap-4">
          <Field className="gap-2 md:grid md:grid-cols-[9rem_1fr] md:items-center">
            <FieldLabel htmlFor="azure-openai-endpoint">Endpoint</FieldLabel>
            <Input
              id="azure-openai-endpoint"
              type="url"
              placeholder="https://your-resource.openai.azure.com"
              value={endpoint}
              onChange={(event) => onEndpointChange(event.target.value)}
              disabled={isLoading || isSaving}
            />
          </Field>

          <Field className="gap-2 md:grid md:grid-cols-[9rem_1fr] md:items-center">
            <FieldLabel htmlFor="azure-openai-deployment">
              Deployment ID
            </FieldLabel>
            <Input
              id="azure-openai-deployment"
              placeholder="gpt-4o-transcribe"
              value={deploymentId}
              onChange={(event) => onDeploymentIdChange(event.target.value)}
              disabled={isLoading || isSaving}
            />
          </Field>

          <Field className="gap-2 md:grid md:grid-cols-[9rem_1fr] md:items-center">
            <FieldLabel htmlFor="azure-openai-api-version">
              API version
            </FieldLabel>
            <Input
              id="azure-openai-api-version"
              value={apiVersion}
              onChange={(event) => onApiVersionChange(event.target.value)}
              disabled={isLoading || isSaving}
            />
          </Field>

          <Field
            data-invalid={Boolean(error)}
            className="gap-2 md:grid md:grid-cols-[9rem_1fr] md:items-start"
          >
            <FieldLabel htmlFor="azure-openai-api-key">API key</FieldLabel>
            <div className="flex flex-col gap-2">
              <Input
                id="azure-openai-api-key"
                type="password"
                autoComplete="off"
                placeholder={hasSavedKey ? SAVED_KEY_PLACEHOLDER : "Azure OpenAI key"}
                value={apiKey}
                onChange={(event) => onApiKeyChange(event.target.value)}
                disabled={isLoading || isSaving}
                aria-invalid={Boolean(error)}
              />
              <FieldError>{error}</FieldError>
            </div>
          </Field>
        </FieldGroup>

        {testResult ? (
          <p className="text-sm text-success" role="status">
            {testResult}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 md:pl-[9rem]">
          <Button type="submit" className="w-fit" disabled={disabled}>
            {isSaving ? "Saving..." : "Save and use Azure OpenAI"}
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
