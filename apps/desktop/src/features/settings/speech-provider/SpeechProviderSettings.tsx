import { type FormEvent, useEffect, useState } from "react";
import { CheckCircle2Icon } from "lucide-react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/app";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { analytics } from "@/lib/analytics/browser";
import { normalizeError } from "@/lib/errors";
import {
  getProviderConfig,
  getProviderStatus,
  getSelectedSpeechProvider,
  saveSpeechProviderSetup,
  testSpeechProvider,
  type SpeechProviderId,
} from "@/lib/tauri";

import { AssemblyAiProviderPanel } from "./AssemblyAiProviderPanel";
import { AzureOpenAiProviderPanel } from "./AzureOpenAiProviderPanel";
import { DeepgramProviderPanel } from "./DeepgramProviderPanel";
import { ElevenLabsProviderPanel } from "./ElevenLabsProviderPanel";
import { OpenAiProviderPanel } from "./OpenAiProviderPanel";
import { ProviderSelector } from "./ProviderSelector";
import { SmallestProviderPanel } from "./SmallestProviderPanel";
import { verifyOnboardingProviderTranscription } from "./onboardingProviderVerification";
import {
  normalizeProviderError,
  providerStatusLabel,
  providerStatusTone,
} from "./status";
import {
  AZURE_OPENAI_API_VERSION,
  DEFAULT_ASSEMBLYAI_MODEL,
  DEFAULT_DEEPGRAM_MODEL,
  DEFAULT_ELEVENLABS_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_SMALLEST_MODEL,
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
  const [assemblyAiApiKey, setAssemblyAiApiKey] = useState("");
  const [deepgramApiKey, setDeepgramApiKey] = useState("");
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState("");
  const [smallestApiKey, setSmallestApiKey] = useState("");
  const [openAiModel, setOpenAiModel] = useState<string>(DEFAULT_OPENAI_MODEL);
  const [assemblyAiModel, setAssemblyAiModel] = useState<string>(
    DEFAULT_ASSEMBLYAI_MODEL,
  );
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
  const selectedProviderReadyMessage = providerTestResults[selectedProviderId];
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
          assemblyAiStatus,
          deepgramStatus,
          elevenLabsStatus,
          smallestStatus,
          openAiConfig,
          azureConfig,
          assemblyAiConfig,
          elevenLabsConfig,
          selectedProvider,
        ] =
          await Promise.all([
            getProviderStatus("openai"),
            getProviderStatus("azure-openai"),
            getProviderStatus("assemblyai"),
            getProviderStatus("deepgram"),
            getProviderStatus("elevenlabs"),
            getProviderStatus("smallest"),
            getProviderConfig("openai"),
            getProviderConfig("azure-openai"),
            getProviderConfig("assemblyai"),
            getProviderConfig("elevenlabs"),
            getSelectedSpeechProvider(),
          ]);
        if (!disposed) {
          setProviderStatuses({
            openai: openAiStatus,
            "azure-openai": azureStatus,
            assemblyai: assemblyAiStatus,
            deepgram: deepgramStatus,
            elevenlabs: elevenLabsStatus,
            smallest: smallestStatus,
          });
          setOpenAiModel(openAiConfig?.model ?? DEFAULT_OPENAI_MODEL);
          setAzureEndpoint(azureConfig?.endpoint ?? "");
          setAzureDeploymentId(azureConfig?.deploymentId ?? "");
          setAzureApiVersion(
            azureConfig?.apiVersion ?? AZURE_OPENAI_API_VERSION,
          );
          setAssemblyAiModel(
            assemblyAiConfig?.model ?? DEFAULT_ASSEMBLYAI_MODEL,
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
      setProviderTestResults({});
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

  const handleAssemblyAiApiKeyChange = (value: string) => {
    clearOnboardingVerification("assemblyai");
    setAssemblyAiApiKey(value);
  };

  const handleAssemblyAiModelChange = (value: string) => {
    clearOnboardingVerification("assemblyai");
    setAssemblyAiModel(value);
  };

  const handleDeepgramApiKeyChange = (value: string) => {
    clearOnboardingVerification("deepgram");
    setDeepgramApiKey(value);
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

  const handleSmallestApiKeyChange = (value: string) => {
    clearOnboardingVerification("smallest");
    setSmallestApiKey(value);
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
      captureProviderConfigured("openai", variant);
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
      captureProviderConfigured("azure-openai", variant);
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

  const saveAssemblyAiKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearOnboardingVerification("assemblyai");
    setProviderErrors((current) => ({ ...current, assemblyai: undefined }));
    setProviderTestResults((current) => ({
      ...current,
      assemblyai: undefined,
    }));
    setSavingProviderId("assemblyai");

    try {
      const status = await saveSpeechProviderSetup({
        providerId: "assemblyai",
        apiKey: assemblyAiApiKey,
        config: {
          model: assemblyAiModel,
        },
        activate: true,
      });
      setProviderStatuses((current) => ({ ...current, assemblyai: status }));
      setAssemblyAiApiKey("");
      setSelectedProviderId("assemblyai");
      captureProviderConfigured("assemblyai", variant);
      if (isOnboarding) {
        await verifySavedProvider("assemblyai");
      } else {
        toast.success("AssemblyAI key saved");
      }
    } catch (err) {
      setProviderErrors((current) => ({
        ...current,
        assemblyai: normalizeProviderError("assemblyai", err),
      }));
    } finally {
      setSavingProviderId(null);
    }
  };

  const saveDeepgramKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearOnboardingVerification("deepgram");
    setProviderErrors((current) => ({ ...current, deepgram: undefined }));
    setProviderTestResults((current) => ({
      ...current,
      deepgram: undefined,
    }));
    setSavingProviderId("deepgram");

    try {
      const status = await saveSpeechProviderSetup({
        providerId: "deepgram",
        apiKey: deepgramApiKey,
        config: {
          model: DEFAULT_DEEPGRAM_MODEL,
        },
        activate: true,
      });
      setProviderStatuses((current) => ({ ...current, deepgram: status }));
      setDeepgramApiKey("");
      setSelectedProviderId("deepgram");
      captureProviderConfigured("deepgram", variant);
      if (isOnboarding) {
        await verifySavedProvider("deepgram");
      } else {
        toast.success("Deepgram key saved");
      }
    } catch (err) {
      setProviderErrors((current) => ({
        ...current,
        deepgram: normalizeProviderError("deepgram", err),
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
      captureProviderConfigured("elevenlabs", variant);
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

  const saveSmallestKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearOnboardingVerification("smallest");
    setProviderErrors((current) => ({ ...current, smallest: undefined }));
    setProviderTestResults((current) => ({
      ...current,
      smallest: undefined,
    }));
    setSavingProviderId("smallest");

    try {
      const status = await saveSpeechProviderSetup({
        providerId: "smallest",
        apiKey: smallestApiKey,
        config: {
          model: DEFAULT_SMALLEST_MODEL,
        },
        activate: true,
      });
      setProviderStatuses((current) => ({ ...current, smallest: status }));
      setSmallestApiKey("");
      setSelectedProviderId("smallest");
      captureProviderConfigured("smallest", variant);
      if (isOnboarding) {
        await verifySavedProvider("smallest");
      } else {
        toast.success("Smallest AI key saved");
      }
    } catch (err) {
      setProviderErrors((current) => ({
        ...current,
        smallest: normalizeProviderError("smallest", err),
      }));
    } finally {
      setSavingProviderId(null);
    }
  };

  const testSelectedProvider = async () => {
    const providerId = selectedProviderId;
    const startedAt = now();
    analytics.capture("provider_test_started", {
      provider_id: providerId,
      source: variant,
    });
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
      analytics.capture("provider_test_completed", {
        duration_bucket: durationBucket(elapsedMs(startedAt)),
        error_code: null,
        provider_id: providerId,
        status: "success",
      });
    } catch (err) {
      setProviderErrors((current) => ({
        ...current,
        [providerId]: normalizeProviderError(providerId, err),
      }));
      analytics.capture("provider_test_completed", {
        duration_bucket: durationBucket(elapsedMs(startedAt)),
        error_code: errorCodeFromUnknown(err),
        provider_id: providerId,
        status: "failed",
      });
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

      {isOnboarding && selectedProviderReadyMessage ? (
        <Alert className="border-success/30 bg-success/5 text-foreground">
          <CheckCircle2Icon aria-hidden={true} className="text-success" />
          <AlertTitle>Provider ready</AlertTitle>
          <AlertDescription>
            {providerLabels[selectedProviderId]} is ready for local dictation.
          </AlertDescription>
        </Alert>
      ) : null}

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
      ) : selectedProviderId === "assemblyai" ? (
        <AssemblyAiProviderPanel
          apiKey={assemblyAiApiKey}
          error={providerErrors.assemblyai}
          isLoading={isLoading}
          isSaving={savingProviderId === "assemblyai"}
          isTesting={testingProviderId === "assemblyai"}
          model={assemblyAiModel}
          showTestButton={!isOnboarding}
          testResult={providerTestResults.assemblyai}
          status={providerStatuses.assemblyai}
          onApiKeyChange={handleAssemblyAiApiKeyChange}
          onModelChange={handleAssemblyAiModelChange}
          onSubmit={saveAssemblyAiKey}
          onTest={testSelectedProvider}
        />
      ) : selectedProviderId === "deepgram" ? (
        <DeepgramProviderPanel
          apiKey={deepgramApiKey}
          error={providerErrors.deepgram}
          isLoading={isLoading}
          isSaving={savingProviderId === "deepgram"}
          isTesting={testingProviderId === "deepgram"}
          showTestButton={!isOnboarding}
          testResult={providerTestResults.deepgram}
          status={providerStatuses.deepgram}
          onApiKeyChange={handleDeepgramApiKeyChange}
          onSubmit={saveDeepgramKey}
          onTest={testSelectedProvider}
        />
      ) : selectedProviderId === "elevenlabs" ? (
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
      ) : (
        <SmallestProviderPanel
          apiKey={smallestApiKey}
          error={providerErrors.smallest}
          isLoading={isLoading}
          isSaving={savingProviderId === "smallest"}
          isTesting={testingProviderId === "smallest"}
          showTestButton={!isOnboarding}
          testResult={providerTestResults.smallest}
          status={providerStatuses.smallest}
          onApiKeyChange={handleSmallestApiKeyChange}
          onSubmit={saveSmallestKey}
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Settings
          </h2>
          <p className="text-sm text-muted-foreground">
            Providers, microphone, hotkey, and app preferences.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <StatusBadge
            tone={providerStatusTone(selectedStatus)}
            className="normal-case tracking-normal"
          >
            {providerStatusLabel(selectedStatus)}
          </StatusBadge>
        </div>
      </div>

      <Card size="sm" className="rounded-lg shadow-none">
        <CardContent className="flex flex-col gap-2.5">
          {providerSetup}
        </CardContent>
      </Card>
    </div>
  );
}

function captureProviderConfigured(
  providerId: SpeechProviderId,
  source: "settings" | "onboarding",
): void {
  analytics.capture("provider_configured", {
    provider_family: providerFamily(providerId),
    provider_id: providerId,
    source,
  });
}

function providerFamily(providerId: SpeechProviderId): string {
  if (providerId === "azure-openai") {
    return "azure";
  }

  return providerId;
}

function errorCodeFromUnknown(err: unknown): string {
  if (err && typeof err === "object") {
    const maybeCode = (err as { code?: unknown }).code;
    if (typeof maybeCode === "string" && maybeCode.trim().length > 0) {
      return maybeCode;
    }
  }

  return "unknown_error";
}

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function elapsedMs(startedAt: number) {
  return Math.max(0, Math.round(now() - startedAt));
}

function durationBucket(valueMs: number) {
  if (valueMs < 250) {
    return "lt_250ms";
  }

  if (valueMs < 1_000) {
    return "250ms_1s";
  }

  if (valueMs < 3_000) {
    return "1s_3s";
  }

  if (valueMs < 10_000) {
    return "3s_10s";
  }

  if (valueMs < 30_000) {
    return "10s_30s";
  }

  return "gte_30s";
}
