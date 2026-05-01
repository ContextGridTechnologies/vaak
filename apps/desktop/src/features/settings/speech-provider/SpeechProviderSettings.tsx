import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

import { SectionPanel, StatusBadge } from "@/components/app";
import { normalizeError } from "@/lib/errors";
import {
  getProviderConfig,
  getProviderStatus,
  getSelectedSpeechProvider,
  saveSpeechProviderSetup,
  testSpeechProvider,
  type SpeechProviderId,
} from "@/lib/tauri";

import { AzureOpenAiProviderPanel } from "./AzureOpenAiProviderPanel";
import { OpenAiProviderPanel } from "./OpenAiProviderPanel";
import { ProviderSelector } from "./ProviderSelector";
import {
  normalizeProviderError,
  providerStatusLabel,
  providerStatusTone,
} from "./status";
import {
  AZURE_OPENAI_API_VERSION,
  providerLabels,
  type ProviderErrors,
  type ProviderStatuses,
} from "./types";

export function SpeechProviderSettings() {
  const [apiKey, setApiKey] = useState("");
  const [azureApiKey, setAzureApiKey] = useState("");
  const [azureEndpoint, setAzureEndpoint] = useState("");
  const [azureDeploymentId, setAzureDeploymentId] = useState("");
  const [azureApiVersion, setAzureApiVersion] = useState(
    AZURE_OPENAI_API_VERSION,
  );
  const [selectedProviderId, setSelectedProviderId] =
    useState<SpeechProviderId>("openai");
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatuses>(
    {},
  );
  const [isLoading, setIsLoading] = useState(true);
  const [savingProviderId, setSavingProviderId] =
    useState<SpeechProviderId | null>(null);
  const [testingProviderId, setTestingProviderId] =
    useState<SpeechProviderId | null>(null);
  const [providerErrors, setProviderErrors] = useState<ProviderErrors>({});
  const [providerTestResults, setProviderTestResults] =
    useState<ProviderErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const selectedStatus = providerStatuses[selectedProviderId];
  const azureHasSavedKey = Boolean(providerStatuses["azure-openai"]?.configured);

  useEffect(() => {
    let disposed = false;

    const loadStatus = async () => {
      setIsLoading(true);
      setGlobalError(null);
      try {
        const [openAiStatus, azureStatus, azureConfig, selectedProvider] =
          await Promise.all([
            getProviderStatus("openai"),
            getProviderStatus("azure-openai"),
            getProviderConfig("azure-openai"),
            getSelectedSpeechProvider(),
          ]);
        if (!disposed) {
          setProviderStatuses({
            openai: openAiStatus,
            "azure-openai": azureStatus,
          });
          setAzureEndpoint(azureConfig?.endpoint ?? "");
          setAzureDeploymentId(azureConfig?.deploymentId ?? "");
          setAzureApiVersion(
            azureConfig?.apiVersion ?? AZURE_OPENAI_API_VERSION,
          );
          setSelectedProviderId(selectedProvider);
        }
      } catch (err) {
        if (!disposed) {
          setGlobalError(normalizeError(err));
        }
      } finally {
        if (!disposed) {
          setIsLoading(false);
        }
      }
    };

    void loadStatus();

    return () => {
      disposed = true;
    };
  }, []);

  const selectProvider = (providerId: SpeechProviderId) => {
    setGlobalError(null);
    setSelectedProviderId(providerId);
  };

  const saveOpenAiKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProviderErrors((current) => ({ ...current, openai: undefined }));
    setProviderTestResults((current) => ({ ...current, openai: undefined }));
    setSavingProviderId("openai");

    try {
      const status = await saveSpeechProviderSetup({
        providerId: "openai",
        apiKey,
        activate: true,
      });
      setProviderStatuses((current) => ({ ...current, openai: status }));
      setApiKey("");
      setSelectedProviderId("openai");
      toast.success("OpenAI key saved");
    } catch (err) {
      setProviderErrors((current) => ({
        ...current,
        openai: normalizeProviderError("openai", err),
      }));
    } finally {
      setSavingProviderId(null);
    }
  };

  const saveAzureOpenAiSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProviderErrors((current) => ({ ...current, "azure-openai": undefined }));
    setProviderTestResults((current) => ({
      ...current,
      "azure-openai": undefined,
    }));
    setSavingProviderId("azure-openai");

    try {
      if (!azureHasSavedKey && azureApiKey.trim().length === 0) {
        setProviderErrors((current) => ({
          ...current,
          "azure-openai": "Azure OpenAI API key is required before first use.",
        }));
        return;
      }

      const status = await saveSpeechProviderSetup({
        providerId: "azure-openai",
        apiKey: azureApiKey,
        config: {
          endpoint: azureEndpoint,
          deploymentId: azureDeploymentId,
          apiVersion: azureApiVersion || AZURE_OPENAI_API_VERSION,
        },
        activate: true,
      });

      setProviderStatuses((current) => ({
        ...current,
        "azure-openai": status,
      }));
      setSelectedProviderId("azure-openai");
      setAzureApiKey("");
      toast.success("Azure OpenAI settings saved");
    } catch (err) {
      setProviderErrors((current) => ({
        ...current,
        "azure-openai": normalizeProviderError("azure-openai", err),
      }));
    } finally {
      setSavingProviderId(null);
    }
  };

  const testSelectedProvider = async () => {
    const providerId = selectedProviderId;
    setProviderErrors((current) => ({ ...current, [providerId]: undefined }));
    setProviderTestResults((current) => ({
      ...current,
      [providerId]: undefined,
    }));
    setTestingProviderId(providerId);

    try {
      const status = await testSpeechProvider(providerId);
      setProviderStatuses((current) => ({ ...current, [providerId]: status }));
      setProviderTestResults((current) => ({
        ...current,
        [providerId]: `${providerLabels[providerId]} provider is ready.`,
      }));
    } catch (err) {
      setProviderErrors((current) => ({
        ...current,
        [providerId]: normalizeProviderError(providerId, err),
      }));
    } finally {
      setTestingProviderId(null);
    }
  };

  return (
    <SectionPanel
      title="Settings"
      description="Microphone, hotkey, provider, and app preferences."
      actions={
        <StatusBadge tone={providerStatusTone(selectedStatus)}>
          {providerStatusLabel(selectedStatus)}
        </StatusBadge>
      }
    >
      {globalError ? (
        <p className="text-sm text-destructive" role="alert">
          {globalError}
        </p>
      ) : null}

      <ProviderSelector
        selectedProviderId={selectedProviderId}
        onSelectProvider={selectProvider}
      />

      {selectedProviderId === "openai" ? (
        <OpenAiProviderPanel
          apiKey={apiKey}
          error={providerErrors.openai}
          isLoading={isLoading}
          isSaving={savingProviderId === "openai"}
          isTesting={testingProviderId === "openai"}
          testResult={providerTestResults.openai}
          status={providerStatuses.openai}
          onApiKeyChange={setApiKey}
          onSubmit={saveOpenAiKey}
          onTest={testSelectedProvider}
        />
      ) : (
        <AzureOpenAiProviderPanel
          apiKey={azureApiKey}
          apiVersion={azureApiVersion}
          deploymentId={azureDeploymentId}
          endpoint={azureEndpoint}
          error={providerErrors["azure-openai"]}
          hasSavedKey={azureHasSavedKey}
          isLoading={isLoading}
          isSaving={savingProviderId === "azure-openai"}
          isTesting={testingProviderId === "azure-openai"}
          testResult={providerTestResults["azure-openai"]}
          onApiKeyChange={setAzureApiKey}
          onApiVersionChange={setAzureApiVersion}
          onDeploymentIdChange={setAzureDeploymentId}
          onEndpointChange={setAzureEndpoint}
          onSubmit={saveAzureOpenAiSettings}
          onTest={testSelectedProvider}
        />
      )}
    </SectionPanel>
  );
}
