import { useEffect, useState } from "react";
import { BadgeCheckIcon, InfoIcon, ZapIcon } from "lucide-react";

import { PermissionCallout, SectionPanel } from "@/components/app";
import { Button } from "@/components/ui/button";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { analytics } from "@/lib/analytics/browser";
import { normalizeError } from "@/lib/errors";
import {
  getSelectedSpeechProvider,
  getSystemSettings,
  isTauriRuntime,
  saveSystemSettings,
  type DictationMode,
  type SpeechProviderId,
} from "@/lib/tauri";

const DEFAULT_DICTATION_MODE: DictationMode = "auto";

type DictationPreference = "fast" | "accurate";

const dictationPreferenceOptions: {
  value: DictationPreference;
  label: string;
  description: string;
}[] = [
  {
    value: "fast",
    label: "Fast",
    description: "Starts writing sooner while you speak.",
  },
  {
    value: "accurate",
    label: "Accurate",
    description: "Waits for the complete recording before transcribing.",
  },
];

const providerLabels: Partial<Record<SpeechProviderId, string>> = {
  openai: "OpenAI",
  "azure-openai": "Azure OpenAI",
  "azure-ai-speech": "Azure AI Speech",
  assemblyai: "AssemblyAI",
  deepgram: "Deepgram",
  elevenlabs: "ElevenLabs",
  smallest: "Smallest AI",
};

export function DictationBehaviorSettingsCard() {
  const [dictationMode, setDictationMode] = useState<DictationMode>(
    DEFAULT_DICTATION_MODE,
  );
  const [selectedProviderId, setSelectedProviderId] =
    useState<SpeechProviderId | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let cancelled = false;
    Promise.all([getSystemSettings(), getSelectedSpeechProvider()])
      .then(([settings, providerId]) => {
        if (!cancelled) {
          setDictationMode(settings.dictationMode);
          setSelectedProviderId(providerId);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(normalizeError(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDictationModeChange(nextMode: DictationMode) {
    const previousMode = dictationMode;
    setDictationMode(nextMode);
    setIsSaving(true);
    setError(null);

    try {
      const latestSettings = await getSystemSettings();
      const savedSettings = await saveSystemSettings({
        ...latestSettings,
        dictationMode: nextMode,
      });
      setDictationMode(savedSettings.dictationMode);
      analytics.capture("setting_changed", {
        setting_id: "dictation_mode",
        value: savedSettings.dictationMode,
      });
    } catch (err) {
      setDictationMode(previousMode);
      setError(normalizeError(err));
      analytics.captureError(err, {
        code: errorCodeFromUnknown(err, "settings_save_failed"),
        handled: true,
        stage: "settings",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePreferenceChange(nextPreference: string) {
    if (nextPreference !== "fast" && nextPreference !== "accurate") {
      return;
    }

    await handleDictationModeChange(dictationModeFromPreference(nextPreference));
  }

  const storedPreference = preferenceFromDictationMode(dictationMode);
  const selectedOption =
    dictationPreferenceOptions.find(
      (option) => option.value === storedPreference,
    ) ?? dictationPreferenceOptions[0];
  const providerLabel = selectedProviderId
    ? providerLabels[selectedProviderId] ?? selectedProviderId
    : "current provider";
  const fastUnavailable =
    selectedProviderId !== null && selectedProviderId !== "assemblyai";
  const displayedPreference =
    fastUnavailable && storedPreference === "fast" ? "accurate" : storedPreference;
  const availabilityText = fastUnavailable
    ? `Fast is not available for ${providerLabel} yet. Use Accurate with this provider.`
    : selectedOption.description;

  return (
    <SectionPanel
      title="Transcription mode"
      description="Choose whether Vaak prioritizes speed or final transcript quality."
      contentClassName="gap-3"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-foreground">
              Speed vs accuracy
            </p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="About transcription mode"
                  >
                    <InfoIcon aria-hidden={true} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-72">
                  Fast can write sooner while you speak. Accurate waits for the
                  full recording before creating the transcript.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-xs text-muted-foreground">
            {availabilityText}
          </p>
        </div>

        <ToggleGroup
          type="single"
          value={displayedPreference}
          onValueChange={(value) => void handlePreferenceChange(value)}
          disabled={isSaving}
          variant="outline"
          spacing={1}
          className="grid w-full grid-cols-2 md:w-[18rem]"
          aria-label="Transcription mode"
        >
          <ToggleGroupItem
            value="fast"
            disabled={fastUnavailable}
            aria-label="Fast transcription"
            className="w-full"
          >
            <ZapIcon data-icon="inline-start" aria-hidden={true} />
            Fast
          </ToggleGroupItem>
          <ToggleGroupItem
            value="accurate"
            aria-label="Accurate transcription"
            className="w-full"
          >
            <BadgeCheckIcon data-icon="inline-start" aria-hidden={true} />
            Accurate
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {error ? (
        <PermissionCallout tone="warning" title="Transcription mode failed">
          {error}
        </PermissionCallout>
      ) : null}
    </SectionPanel>
  );
}

function preferenceFromDictationMode(mode: DictationMode): DictationPreference {
  return mode === "standard" ? "accurate" : "fast";
}

function dictationModeFromPreference(
  preference: DictationPreference,
): DictationMode {
  return preference === "accurate" ? "standard" : "streaming";
}

function errorCodeFromUnknown(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const maybeCode = (err as { code?: unknown }).code;
    if (typeof maybeCode === "string" && maybeCode.trim().length > 0) {
      return maybeCode;
    }
  }

  return fallback;
}
