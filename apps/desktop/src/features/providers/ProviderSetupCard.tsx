import {
  AudioLinesIcon,
  BotIcon,
  CheckIcon,
  CloudCogIcon,
  KeyRoundIcon,
  ZapIcon,
} from "lucide-react";

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
import { cn } from "@/lib/utils";

import type { ProviderCatalogItem, ProviderSetupStatus } from "./providerCatalog";

type ProviderSetupCardProps = {
  provider: ProviderCatalogItem;
  mode?: "setup" | "select";
  selected?: boolean;
  statusLabel?: string;
  statusTone?: "neutral" | "success" | "warning";
  onSelect?: () => void;
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

export function ProviderSetupCard({
  provider,
  mode = "setup",
  selected = false,
  statusLabel,
  statusTone,
  onSelect,
}: ProviderSetupCardProps) {
  if (mode === "select") {
    return (
      <Button
        type="button"
        variant="outline"
        aria-label={provider.name}
        aria-pressed={selected}
        data-state={selected ? "selected" : "idle"}
        className={cn(
          "h-auto min-h-9 w-full justify-center gap-2 rounded-lg px-3 py-2 text-center shadow-sm",
          selected &&
            "border-primary bg-primary/10 text-foreground shadow-primary/10 ring-1 ring-primary/20 hover:border-primary hover:bg-primary/12 hover:text-foreground",
        )}
        onClick={onSelect}
      >
        <span className="truncate text-sm font-medium">
          {provider.name}
        </span>
      </Button>
    );
  }

  return (
    <Card size="sm" className="h-full rounded-lg shadow-none">
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
          <ProviderIcon providerId={provider.id} />
          <CardTitle>{provider.name}</CardTitle>
        </div>
        <CardDescription>{provider.description}</CardDescription>
        <CardAction>
          <StatusBadge
            tone={statusTone ?? setupStatusTone[provider.setupStatus]}
          >
            {statusLabel ?? setupStatusLabel[provider.setupStatus]}
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

function ProviderIcon({
  providerId,
  selected = false,
}: {
  providerId: ProviderCatalogItem["id"];
  selected?: boolean;
}) {
  const Icon = getProviderIcon(providerId);

  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground shadow-sm",
        selected && "border-primary/25 text-primary shadow-primary/10",
      )}
    >
      <Icon aria-hidden={true} />
    </span>
  );
}

function getProviderIcon(providerId: ProviderCatalogItem["id"]) {
  switch (providerId) {
    case "openai":
      return BotIcon;
    case "azure-openai":
      return CloudCogIcon;
    case "azure-ai-speech":
      return CloudCogIcon;
    case "assemblyai":
      return AudioLinesIcon;
    case "deepgram":
      return AudioLinesIcon;
    case "groq":
      return ZapIcon;
    case "elevenlabs":
      return AudioLinesIcon;
    case "smallest":
      return AudioLinesIcon;
  }
}

function formatCategory(category: ProviderCatalogItem["categories"][number]) {
  switch (category) {
    case "speech-to-text":
      return "Speech";
    case "rewrite":
      return "Rewrite";
  }
}
