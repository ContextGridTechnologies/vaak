import {
  Field,
  FieldDescription,
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
  const selectedProvider = speechProviderCatalog.find(
    (provider) => provider.id === selectedProviderId,
  );

  return (
    <FieldGroup>
      <Field>
        <FieldLabel>Speech provider</FieldLabel>
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
        {selectedProvider ? (
          <p className="text-sm font-medium text-foreground">
            Default provider: {selectedProvider.name}
          </p>
        ) : null}
        <FieldDescription>
          The floating voice capsule uses this provider for transcription.
          Saving a provider activates it.
        </FieldDescription>
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
    provider.id === "assemblyai" ||
    provider.id === "deepgram" ||
    provider.id === "elevenlabs" ||
    provider.id === "smallest"
  );
}
