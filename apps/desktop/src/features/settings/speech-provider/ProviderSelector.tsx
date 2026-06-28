import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { ProviderSetupCard, providerCatalog } from "@/features/providers";
import type { ProviderCatalogItem } from "@/features/providers";
import type { SpeechProviderId } from "@/lib/tauri";

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
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
          {speechProviderCatalog.map((provider) => (
            <ProviderSetupCard
              key={provider.id}
              provider={provider}
              mode="select"
              selected={selectedProviderId === provider.id}
              onSelect={() => onSelectProvider(provider.id)}
            />
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
