import { useCallback, useEffect, useState } from "react";
import { CheckCircle2Icon, CircleAlertIcon, PlugZapIcon } from "lucide-react";

import { SectionPanel } from "@/components/app";
import { appScreenContentClassName } from "@/components/app/AppScreen";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  getMcpConnectors,
  getMcpSkills,
  installMcpConnector,
  setMcpAgentBinding,
  setMcpConnectorEnabled,
  setMcpSkillBinding,
  setMcpToolGrant,
  testMcpConnector,
  uninstallMcpConnector,
  type McpConnector,
  type McpSkill,
  type McpToolGrant,
} from "@/lib/tauri/mcp";

export function McpPanel() {
  const [connectors, setConnectors] = useState<McpConnector[]>([]);
  const [skills, setSkills] = useState<McpSkill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextConnectors, nextSkills] = await Promise.all([
        getMcpConnectors(),
        getMcpSkills(),
      ]);
      setConnectors(nextConnectors);
      setSkills(nextSkills);
      setError(null);
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    try {
      setError(null);
      await action();
      await load();
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  }

  const connector = connectors[0];

  return (
    <main className={appScreenContentClassName}>
      {error ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>MCP action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <SectionPanel
        title="MCPs"
        description="Connect reviewed local tools to the Voice Agent. Installing, enabling, attaching, and granting tools are separate choices."
      >
        {!connector ? (
          <p className="text-sm text-muted-foreground">Loading MCP catalog…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 rounded-md border bg-muted/40 p-2 text-muted-foreground">
                  <PlugZapIcon className="size-4" aria-hidden="true" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-medium">{connector.name}</h2>
                    <Badge variant={connector.installed ? "secondary" : "outline"}>
                      {connector.installed ? "Installed" : "Not installed"}
                    </Badge>
                    <Badge variant="outline">v{connector.version}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Pinned local stdio server · no shell permission exposed to the WebView
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {connector.installed ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setHealth("Testing…");
                        void run(async () => {
                          const result = await testMcpConnector();
                          setHealth(
                            result.ready
                              ? `Ready · ${result.discoveredTools.length} tools discovered`
                              : "Not ready",
                          );
                        });
                      }}
                    >
                      Test connection
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void run(() => uninstallMcpConnector(connector.connectorId))}
                    >
                      Uninstall
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void run(() => installMcpConnector(connector.connectorId))}
                  >
                    Install
                  </Button>
                )}
              </div>
            </div>

            {health ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
                {health.startsWith("Ready") ? (
                  <CheckCircle2Icon className="size-3.5 text-emerald-600" aria-hidden="true" />
                ) : null}
                {health}
              </div>
            ) : null}

            <Separator />

            <div className="grid gap-3 sm:grid-cols-2">
              <ControlRow
                label={`Enable ${connector.name}`}
                description="Allow Vaak to start this connector when needed."
                checked={connector.enabled}
                disabled={!connector.installed}
                onCheckedChange={(enabled) =>
                  void run(() =>
                    setMcpConnectorEnabled(connector.connectorId, enabled),
                  )
                }
              />
              <ControlRow
                label="Attach to Voice Agent"
                description="Make granted tools eligible for new voice sessions."
                checked={connector.bound}
                disabled={!connector.installed}
                onCheckedChange={(enabled) =>
                  void run(() => setMcpAgentBinding(connector.connectorId, enabled))
                }
              />
            </div>

            <Separator />

            <div>
              <div className="mb-2">
                <h3 className="text-sm font-medium">Tools</h3>
                <p className="text-xs text-muted-foreground">
                  No tool is granted by installation. “Ask every time” pauses before execution.
                </p>
              </div>
              <div className="divide-y rounded-md border">
                {connector.tools.map((tool) => (
                  <div
                    key={tool.name}
                    className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <code className="text-xs font-medium">{tool.name}</code>
                      <p className="text-xs capitalize text-muted-foreground">
                        {isBlockedRawTool(tool.name)
                          ? "Blocked by Vaak policy"
                          : `${tool.risk} risk`}
                      </p>
                    </div>
                    <select
                      aria-label={`Permission for ${tool.name}`}
                      className="h-8 cursor-pointer rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      value={tool.grant}
                      disabled={!connector.installed || isBlockedRawTool(tool.name)}
                      onChange={(event) => {
                        const grant = event.target.value as McpToolGrant;
                        if (grant === "notGranted") return;
                        void run(() =>
                          setMcpToolGrant(
                            connector.connectorId,
                            tool.name,
                            grant,
                          ),
                        );
                      }}
                    >
                      <option value="notGranted">Not granted</option>
                      <option value="always">Always allow</option>
                      <option value="ask">Ask every time</option>
                      <option value="deny">Deny</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </SectionPanel>

      <SectionPanel
        title="Skills"
        description="Skills add instructions to an agent. They never grant MCP tools."
      >
        {skills.map((skill) => (
          <ControlRow
            key={skill.skillId}
            label={`Attach ${skill.name}`}
            visibleLabel={skill.name}
            description="Teach the Voice Agent the preferred Windows automation workflow."
            checked={skill.bound}
            disabled={!skill.enabled}
            onCheckedChange={(enabled) =>
              void run(() => setMcpSkillBinding(skill.skillId, enabled))
            }
          />
        ))}
      </SectionPanel>
    </main>
  );
}

function ControlRow({
  label,
  visibleLabel = label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  visibleLabel?: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-md border px-3 py-2.5">
      <span>
        <span className="block text-sm font-medium">{visibleLabel}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <Switch
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </label>
  );
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error && "message" in error) {
    return String(error.message);
  }
  return String(error);
}

function isBlockedRawTool(name: string): boolean {
  return name === "windows_batch" || name === "windows_close";
}
