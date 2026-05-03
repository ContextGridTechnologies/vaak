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
  return (
    <FieldGroup>
      <Field>
        <FieldLabel>Speech provider</FieldLabel>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]">
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
    provider.id === "elevenlabs" ||
    provider.id === "smallest"
  );
}
