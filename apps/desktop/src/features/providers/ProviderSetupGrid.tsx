import { providerCatalog } from "./providerCatalog";
import { ProviderSetupCard } from "./ProviderSetupCard";

export function ProviderSetupGrid() {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {providerCatalog.map((provider) => (
        <ProviderSetupCard key={provider.id} provider={provider} />
      ))}
    </div>
  );
}
