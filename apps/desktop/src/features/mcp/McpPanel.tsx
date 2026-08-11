import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  PlugZapIcon,
} from "lucide-react";

import { PageHeader, SectionPanel } from "@/components/app";
import { appScreenContentClassName } from "@/components/app/AppScreen";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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

import { McpConnectorCard } from "./McpConnectorCard";

export function McpPanel() {
  const [connectors, setConnectors] = useState<McpConnector[]>([]);
  const [skills, setSkills] = useState<McpSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<string | null>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const catalogActionRef = useRef<HTMLButtonElement>(null);
  const lastSelectedConnectorIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextConnectors, nextSkills] = await Promise.all([
        getMcpConnectors(),
        getMcpSkills(),
      ]);
      setConnectors(nextConnectors);
      setSkills(nextSkills);
      setCatalogLoaded(true);
      setError(null);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selectedConnectorId) {
      detailHeadingRef.current?.focus();
    } else if (lastSelectedConnectorIdRef.current) {
      catalogActionRef.current?.focus();
    }
  }, [selectedConnectorId]);

  async function run(action: () => Promise<unknown>) {
    try {
      setError(null);
      await action();
      await load();
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  }

  const connector = connectors.find(({ connectorId }) => connectorId === selectedConnectorId);

  return (
    <main className={appScreenContentClassName}>
      {error ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>MCP action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!connector ? (
        <>
          <PageHeader
            title="MCP catalog"
            description="Browse reviewed local connectors. Open an MCP to install it, attach it to an agent, and choose tool permissions."
          />
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading MCP catalog…</p>
          ) : !catalogLoaded ? null : connectors.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PlugZapIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No MCPs are available for this device.</EmptyTitle>
                <EmptyDescription>
                  Vaak only lists reviewed connectors compatible with this installation.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <section className="grid gap-4 sm:grid-cols-2" role="list">
              {connectors.map((catalogConnector) => (
                <McpConnectorCard
                  key={catalogConnector.connectorId}
                  connector={catalogConnector}
                  actionRef={
                    catalogConnector.connectorId === lastSelectedConnectorIdRef.current
                      ? catalogActionRef
                      : undefined
                  }
                  onSelect={() => {
                    setHealth(null);
                    lastSelectedConnectorIdRef.current = catalogConnector.connectorId;
                    setSelectedConnectorId(catalogConnector.connectorId);
                  }}
                />
              ))}
            </section>
          )}
        </>
      ) : (
        <>
          <PageHeader
            title={connector.name}
            titleRef={detailHeadingRef}
            description="Manage installation, Voice Agent access, and explicit tool permissions for this MCP."
            actions={
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setHealth(null);
                  setSelectedConnectorId(null);
                }}
              >
                <ArrowLeftIcon data-icon="inline-start" />
                Back to MCP catalog
              </Button>
            }
          />

          <SectionPanel
            title="Connection"
            description="Review installation and decide when this connector can be used."
            className="border border-border/70 shadow-sm"
            contentClassName="gap-4"
            actions={
              <div className="flex flex-wrap items-center justify-end gap-2">
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
                  ) : connector.status === "available" ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void run(() => installMcpConnector(connector.connectorId))}
                    >
                      Install
                    </Button>
                  ) : (
                    <Badge variant="outline">Under review</Badge>
                  )}
              </div>
            }
          >
            <div className="overflow-hidden rounded-lg bg-primary text-primary-foreground">
              <div className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/14 text-primary-foreground ring-1 ring-primary-foreground/25">
                  <PlugZapIcon className="size-6" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className="border-0 bg-primary-foreground/18 text-primary-foreground"
                    >
                      {connector.installed
                        ? "Installed"
                        : connector.status === "candidate"
                          ? "Under review"
                          : "Available"}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-0 bg-primary-foreground/12 text-primary-foreground/90"
                    >
                      v{connector.version}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-0 bg-primary-foreground/12 text-primary-foreground/90"
                    >
                      Local
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-5 opacity-85">{connector.description}</p>
                </div>
              </div>
            </div>

            {health ? (
              <div
                className="flex items-center gap-1.5 rounded-md bg-muted/45 px-3 py-2 text-xs text-muted-foreground"
                role="status"
              >
                {health.startsWith("Ready") ? (
                  <CheckCircle2Icon className="size-3.5 text-primary" aria-hidden="true" />
                ) : null}
                {health}
              </div>
            ) : null}

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
          </SectionPanel>

          <SectionPanel
            title="Tool permissions"
            description="Choose which tools the Voice Agent may use. “Ask every time” pauses before execution."
            className="border border-border/70 shadow-sm"
            contentClassName="gap-0"
            actions={
              <Badge variant="outline">
                {connector.tools.length} {connector.tools.length === 1 ? "tool" : "tools"}
              </Badge>
            }
          >
            <div className="overflow-hidden rounded-lg border border-border/70">
              <div className="divide-y divide-border/70">
                {connector.tools.map((tool) => {
                  const blocked = isBlockedRawTool(tool.name);

                  return (
                    <div
                      key={tool.name}
                      className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-3 py-2.5 sm:px-4"
                    >
                      <div className="min-w-0">
                        <code className="text-sm font-medium [overflow-wrap:anywhere]">{tool.name}</code>
                        <div className="mt-1">
                          <Badge variant={blocked || tool.risk === "mutating" ? "outline" : "secondary"}>
                            {blocked ? "Blocked by Vaak policy" : `${tool.risk} risk`}
                          </Badge>
                        </div>
                      </div>
                      <select
                        aria-label={`Permission for ${tool.name}`}
                        className="h-8 min-w-36 cursor-pointer rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        value={tool.grant}
                        disabled={!connector.installed || blocked}
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
                  );
                })}
              </div>
            </div>
          </SectionPanel>
        </>
      )}

      {connector ? (
        <SectionPanel
          title="Skills"
          description="Skills add instructions to an agent. They never grant MCP tools."
          className="border border-border/70 shadow-sm"
          contentClassName="gap-3"
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
      ) : null}
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
    <label className="flex items-center justify-between gap-4 rounded-lg border border-border/70 bg-muted/25 px-3 py-3">
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
