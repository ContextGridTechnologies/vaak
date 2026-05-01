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
    endpoint.trim().length === 0 ||
    deploymentId.trim().length === 0;

  return (
    <form onSubmit={onSubmit}>
      <FieldGroup className="rounded-lg border border-border p-4">
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
          <Field>
            <FieldLabel htmlFor="azure-openai-endpoint">Endpoint</FieldLabel>
            <Input
              id="azure-openai-endpoint"
              type="url"
              placeholder="https://your-resource.openai.azure.com"
              value={endpoint}
              onChange={(event) => onEndpointChange(event.target.value)}
              disabled={isLoading || isSaving}
            />
            <FieldDescription>
              Use the Azure OpenAI resource endpoint, not a deployment URL.
            </FieldDescription>
          </Field>

          <Field>
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

          <Field>
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

          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="azure-openai-api-key">API key</FieldLabel>
            <Input
              id="azure-openai-api-key"
              type="password"
              autoComplete="off"
              placeholder="Azure OpenAI key"
              value={apiKey}
              onChange={(event) => onApiKeyChange(event.target.value)}
              disabled={isLoading || isSaving}
              aria-invalid={Boolean(error)}
            />
            <FieldDescription>
              Stored locally in the operating system keychain. Re-enter the key
              when changing Azure settings.
            </FieldDescription>
            <FieldError>{error}</FieldError>
          </Field>
        </FieldGroup>

        {testResult ? (
          <p className="text-sm text-success" role="status">
            {testResult}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="w-fit" disabled={disabled}>
            {isSaving ? "Saving..." : "Save and use Azure OpenAI"}
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
