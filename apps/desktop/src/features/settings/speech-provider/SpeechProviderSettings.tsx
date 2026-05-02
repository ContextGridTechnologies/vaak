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
import { ElevenLabsProviderPanel } from "./ElevenLabsProviderPanel";
import { OpenAiProviderPanel } from "./OpenAiProviderPanel";
import { ProviderSelector } from "./ProviderSelector";
import { verifyOnboardingProviderTranscription } from "./onboardingProviderVerification";
import {
  normalizeProviderError,
  providerStatusLabel,
  providerStatusTone,
} from "./status";
import {
  AZURE_OPENAI_API_VERSION,
  DEFAULT_ELEVENLABS_MODEL,
  DEFAULT_OPENAI_MODEL,
  providerLabels,
  type ProviderErrors,
  type ProviderStatuses,
} from "./types";

type SpeechProviderSettingsProps = {
  variant?: "settings" | "onboarding";
  onOnboardingVerifiedChange?: (verified: boolean) => void;
  verifyOnboardingProvider?: (
    providerId: SpeechProviderId,
  ) => Promise<{ text: string }>;
};

export function SpeechProviderSettings({
  variant = "settings",
  onOnboardingVerifiedChange,
  verifyOnboardingProvider = verifyOnboardingProviderTranscription,
}: SpeechProviderSettingsProps) {
  const [apiKey, setApiKey] = useState("");
  const [azureApiKey, setAzureApiKey] = useState("");
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState("");
  const [openAiModel, setOpenAiModel] = useState<string>(DEFAULT_OPENAI_MODEL);
  const [elevenLabsModel, setElevenLabsModel] = useState<string>(
    DEFAULT_ELEVENLABS_MODEL,
  );
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
  const isOnboarding = variant === "onboarding";

  useEffect(() => {
    let disposed = false;

    const loadStatus = async () => {
      setIsLoading(true);
      setGlobalError(null);
      try {
        const [
          openAiStatus,
          azureStatus,
          elevenLabsStatus,
          openAiConfig,
          azureConfig,
          elevenLabsConfig,
          selectedProvider,
        ] =
          await Promise.all([
            getProviderStatus("openai"),
            getProviderStatus("azure-openai"),
            getProviderStatus("elevenlabs"),
            getProviderConfig("openai"),
            getProviderConfig("azure-openai"),
            getProviderConfig("elevenlabs"),
            getSelectedSpeechProvider(),
          ]);
        if (!disposed) {
          setProviderStatuses({
            openai: openAiStatus,
            "azure-openai": azureStatus,
            elevenlabs: elevenLabsStatus,
          });
          setOpenAiModel(openAiConfig?.model ?? DEFAULT_OPENAI_MODEL);
          setAzureEndpoint(azureConfig?.endpoint ?? "");
          setAzureDeploymentId(azureConfig?.deploymentId ?? "");
          setAzureApiVersion(
            azureConfig?.apiVersion ?? AZURE_OPENAI_API_VERSION,
          );
          setElevenLabsModel(
            elevenLabsConfig?.model ?? DEFAULT_ELEVENLABS_MODEL,
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
    if (isOnboarding) {
      onOnboardingVerifiedChange?.(false);
    }
    setSelectedProviderId(providerId);
  };

  const clearOnboardingVerification = (providerId?: SpeechProviderId) => {
    if (!isOnboarding) {
      return;
    }

    onOnboardingVerifiedChange?.(false);

    if (providerId) {
      setProviderTestResults((current) => ({ ...current, [providerId]: undefined }));
    }
  };

  const handleOpenAiApiKeyChange = (value: string) => {
    clearOnboardingVerification("openai");
    setApiKey(value);
  };

  const handleOpenAiModelChange = (value: string) => {
    clearOnboardingVerification("openai");
    setOpenAiModel(value);
  };

  const handleAzureApiKeyChange = (value: string) => {
    clearOnboardingVerification("azure-openai");
    setAzureApiKey(value);
  };

  const handleAzureEndpointChange = (value: string) => {
    clearOnboardingVerification("azure-openai");
    setAzureEndpoint(value);
  };

  const handleAzureDeploymentIdChange = (value: string) => {
    clearOnboardingVerification("azure-openai");
    setAzureDeploymentId(value);
  };

  const handleAzureApiVersionChange = (value: string) => {
    clearOnboardingVerification("azure-openai");
    setAzureApiVersion(value);
  };

  const handleElevenLabsApiKeyChange = (value: string) => {
    clearOnboardingVerification("elevenlabs");
    setElevenLabsApiKey(value);
  };

  const handleElevenLabsModelChange = (value: string) => {
    clearOnboardingVerification("elevenlabs");
    setElevenLabsModel(value);
  };

  const verifySavedProvider = async (providerId: SpeechProviderId) => {
    setProviderErrors((current) => ({ ...current, [providerId]: undefined }));
    setProviderTestResults((current) => ({ ...current, [providerId]: undefined }));
    setTestingProviderId(providerId);

    try {
      await verifyOnboardingProvider(providerId);
      setProviderTestResults((current) => ({
        ...current,
        [providerId]: "Provider test passed.",
      }));
      onOnboardingVerifiedChange?.(true);
    } catch (err) {
      setProviderErrors((current) => ({
        ...current,
        [providerId]: normalizeProviderError(providerId, err),
      }));
      onOnboardingVerifiedChange?.(false);
    } finally {
      setTestingProviderId(null);
    }
  };

  const saveOpenAiKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearOnboardingVerification("openai");
    setProviderErrors((current) => ({ ...current, openai: undefined }));
    setProviderTestResults((current) => ({ ...current, openai: undefined }));
    setSavingProviderId("openai");

    try {
      const status = await saveSpeechProviderSetup({
        providerId: "openai",
        apiKey,
        config: {
          model: openAiModel,
        },
        activate: true,
      });
      setProviderStatuses((current) => ({ ...current, openai: status }));
      setApiKey("");
      setSelectedProviderId("openai");
      if (isOnboarding) {
        await verifySavedProvider("openai");
      } else {
        toast.success("OpenAI key saved");
      }
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
    clearOnboardingVerification("azure-openai");
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
      if (isOnboarding) {
        await verifySavedProvider("azure-openai");
      } else {
        toast.success("Azure OpenAI settings saved");
      }
    } catch (err) {
      setProviderErrors((current) => ({
        ...current,
        "azure-openai": normalizeProviderError("azure-openai", err),
      }));
    } finally {
      setSavingProviderId(null);
    }
  };

  const saveElevenLabsKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearOnboardingVerification("elevenlabs");
    setProviderErrors((current) => ({ ...current, elevenlabs: undefined }));
    setProviderTestResults((current) => ({
      ...current,
      elevenlabs: undefined,
    }));
    setSavingProviderId("elevenlabs");

    try {
      const status = await saveSpeechProviderSetup({
        providerId: "elevenlabs",
        apiKey: elevenLabsApiKey,
        config: {
          model: elevenLabsModel,
        },
        activate: true,
      });
      setProviderStatuses((current) => ({ ...current, elevenlabs: status }));
      setElevenLabsApiKey("");
      setSelectedProviderId("elevenlabs");
      if (isOnboarding) {
        await verifySavedProvider("elevenlabs");
      } else {
        toast.success("ElevenLabs key saved");
      }
    } catch (err) {
      setProviderErrors((current) => ({
        ...current,
        elevenlabs: normalizeProviderError("elevenlabs", err),
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

  const providerSetup = (
    <>
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
          model={openAiModel}
          showTestButton={!isOnboarding}
          testResult={providerTestResults.openai}
          status={providerStatuses.openai}
          onApiKeyChange={handleOpenAiApiKeyChange}
          onModelChange={handleOpenAiModelChange}
          onSubmit={saveOpenAiKey}
          onTest={testSelectedProvider}
        />
      ) : selectedProviderId === "azure-openai" ? (
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
          showTestButton={!isOnboarding}
          testResult={providerTestResults["azure-openai"]}
          onApiKeyChange={handleAzureApiKeyChange}
          onApiVersionChange={handleAzureApiVersionChange}
          onDeploymentIdChange={handleAzureDeploymentIdChange}
          onEndpointChange={handleAzureEndpointChange}
          onSubmit={saveAzureOpenAiSettings}
          onTest={testSelectedProvider}
        />
      ) : (
        <ElevenLabsProviderPanel
          apiKey={elevenLabsApiKey}
          error={providerErrors.elevenlabs}
          isLoading={isLoading}
          isSaving={savingProviderId === "elevenlabs"}
          isTesting={testingProviderId === "elevenlabs"}
          model={elevenLabsModel}
          showTestButton={!isOnboarding}
          testResult={providerTestResults.elevenlabs}
          status={providerStatuses.elevenlabs}
          onApiKeyChange={handleElevenLabsApiKeyChange}
          onModelChange={handleElevenLabsModelChange}
          onSubmit={saveElevenLabsKey}
          onTest={testSelectedProvider}
        />
      )}
    </>
  );

  if (isOnboarding) {
    return (
      <div className="flex flex-col gap-4">
        {providerSetup}
      </div>
    );
  }

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
      {providerSetup}
    </SectionPanel>
  );
}
