import type { Ref } from "react";
import { ChevronRightIcon, PlugZapIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { McpConnector } from "@/lib/tauri/mcp";

type McpConnectorCardProps = {
  connector: McpConnector;
  actionRef?: Ref<HTMLButtonElement>;
  onSelect: () => void;
};

export function McpConnectorCard({
  connector,
  actionRef,
  onSelect,
}: McpConnectorCardProps) {
  const action = connector.installed ? "Manage" : "View";

  return (
    <Card
      size="sm"
      className="group min-h-52 rounded-lg shadow-sm transition-[box-shadow,transform,border-color] duration-150 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md hover:ring-primary/25"
      role="listitem"
    >
      <CardHeader className="gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 via-primary/10 to-primary/5 text-primary ring-1 ring-primary/20 transition-transform duration-150 group-hover:scale-105">
            <PlugZapIcon className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base">
              <h2 className="truncate">{connector.name}</h2>
            </CardTitle>
            <CardDescription className="mt-1 leading-5">
              {connector.description}
            </CardDescription>
          </div>
        </div>
        <CardAction>
          <Badge variant={connector.installed ? "secondary" : "outline"}>
            {connector.installed
              ? "Installed"
              : connector.status === "candidate"
                ? "Under review"
                : "Available"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Badge variant="outline">Local</Badge>
        <Badge variant="outline">v{connector.version}</Badge>
        <Badge variant="outline">
          {connector.tools.length} {connector.tools.length === 1 ? "tool" : "tools"}
        </Badge>
      </CardContent>
      <CardFooter className="mt-auto justify-between border-t-0 bg-transparent">
        <span className="text-xs text-muted-foreground">Reviewed by Vaak</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`${action} ${connector.name}`}
          ref={actionRef}
          onClick={onSelect}
        >
          {action}
          <ChevronRightIcon
            data-icon="inline-end"
            className="transition-transform duration-150 group-hover:translate-x-0.5"
          />
        </Button>
      </CardFooter>
    </Card>
  );
}