import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SpeechProviderId } from "@/lib/tauri";

type ProviderSelectorProps = {
  selectedProviderId: SpeechProviderId;
  onSelectProvider: (providerId: SpeechProviderId) => void;
};

export function ProviderSelector({
  selectedProviderId,
  onSelectProvider,
}: ProviderSelectorProps) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel>Speech provider</FieldLabel>
        <Select value={selectedProviderId} onValueChange={onSelectProvider}>
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue placeholder="Choose speech provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="azure-openai">Azure OpenAI</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>
          The floating voice capsule uses this provider for transcription.
          Saving a provider activates it.
        </FieldDescription>
      </Field>
    </FieldGroup>
  );
}
