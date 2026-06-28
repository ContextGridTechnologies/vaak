import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { providerCatalog } from "@/features/providers";
import type { ProviderCatalogItem } from "@/features/providers";
import type { SpeechProviderId } from "@/lib/tauri";
import { cn } from "@/lib/utils";

type ProviderSelectorProps = {
  selectedProviderId: SpeechProviderId;
  onSelectProvider: (providerId: SpeechProviderId) => void;
};

const speechProviderCatalog = providerCatalog.filter(isSpeechProvider);

export function ProviderSelector({
  selectedProviderId,
  onSelectProvider,
}: ProviderSelectorProps) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel>Provider</FieldLabel>
        <FieldDescription>
          Select the transcription service used for dictation.
        </FieldDescription>
        <div className="grid grid-cols-2 gap-2 pt-2 md:grid-cols-3 lg:grid-cols-5">
          {speechProviderCatalog.map((provider) => (
            <Button
              key={provider.id}
              type="button"
              variant="outline"
              aria-pressed={selectedProviderId === provider.id}
              className={cn(
                "min-h-12 justify-center rounded-md px-4 py-2 text-sm font-medium shadow-none",
                selectedProviderId === provider.id &&
                  "border-primary bg-primary/10 text-foreground hover:bg-primary/10",
              )}
              onClick={() => onSelectProvider(provider.id)}
            >
              {provider.name}
            </Button>
          ))}
        </div>
      </Field>
    </FieldGroup>
  );
}

function isSpeechProvider(
  provider: ProviderCatalogItem,
): provider is ProviderCatalogItem & { id: SpeechProviderId } {
  return (
    provider.id === "openai" ||
    provider.id === "azure-openai" ||
    provider.id === "azure-ai-speech" ||
    provider.id === "assemblyai" ||
    provider.id === "deepgram" ||
    provider.id === "elevenlabs" ||
    provider.id === "smallest"
  );
}
