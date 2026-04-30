import { CheckIcon, KeyRoundIcon } from "lucide-react";

import { StatusBadge } from "@/components/app";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { ProviderCatalogItem, ProviderSetupStatus } from "./providerCatalog";

type ProviderSetupCardProps = {
  provider: ProviderCatalogItem;
};

const setupStatusLabel: Record<ProviderSetupStatus, string> = {
  "not-configured": "Not configured",
  configured: "Configured",
  "coming-soon": "Coming soon",
};

const setupStatusTone: Record<
  ProviderSetupStatus,
  "neutral" | "success" | "warning"
> = {
  "not-configured": "neutral",
  configured: "success",
  "coming-soon": "warning",
};

export function ProviderSetupCard({ provider }: ProviderSetupCardProps) {
  return (
    <Card size="sm" className="h-full rounded-lg shadow-none">
      <CardHeader>
        <CardTitle>{provider.name}</CardTitle>
        <CardDescription>{provider.description}</CardDescription>
        <CardAction>
          <StatusBadge tone={setupStatusTone[provider.setupStatus]}>
            {setupStatusLabel[provider.setupStatus]}
          </StatusBadge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {provider.categories.map((category) => (
            <StatusBadge key={category} tone="neutral">
              {formatCategory(category)}
            </StatusBadge>
          ))}
        </div>
        <div className="flex min-w-0 items-start gap-2 text-sm text-muted-foreground">
          <KeyRoundIcon data-icon="inline-start" />
          <span>{provider.credentialLabel}</span>
        </div>
        {provider.modelHint ? (
          <div className="flex min-w-0 items-start gap-2 text-sm text-muted-foreground">
            <CheckIcon data-icon="inline-start" />
            <span>{provider.modelHint}</span>
          </div>
        ) : null}
        <Button size="sm" variant="outline" className="mt-auto w-full" disabled>
          Configure
        </Button>
      </CardContent>
    </Card>
  );
}

function formatCategory(category: ProviderCatalogItem["categories"][number]) {
  switch (category) {
    case "speech-to-text":
      return "Speech";
    case "rewrite":
      return "Rewrite";
  }
}
