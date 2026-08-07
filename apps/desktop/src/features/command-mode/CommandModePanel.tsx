import { SectionPanel } from "@/components/app";
import { appScreenContentClassName } from "@/components/app/AppScreen";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAssemblyAiVoiceAgent } from "@/features/floating/useAssemblyAiVoiceAgent";

export function CommandModePanel() {
  const agent = useAssemblyAiVoiceAgent({ windowLabel: "main" });

  return (
    <main className={appScreenContentClassName}>
      <SectionPanel
        title="Voice Agent"
        description="Talk to the agent and use the tools granted under MCPs."
        actions={
          <Button
            type="button"
            aria-pressed={agent.isActive}
            onClick={() => {
              void (agent.isActive ? agent.stop() : agent.start());
            }}
          >
            {agent.isActive ? "Stop voice agent" : "Start voice agent"}
          </Button>
        }
      >
        <p role="status" className="text-sm text-muted-foreground">
          {agent.message}
        </p>
        {agent.pendingApproval ? (
          <Alert>
            <AlertTitle>
              {agent.pendingApproval.toolName} needs approval
            </AlertTitle>
            <AlertDescription>
              This is a {agent.pendingApproval.risk} Windows action. The approval
              applies only to this call.
            </AlertDescription>
            <code className="mt-1 block break-all rounded bg-muted px-2 py-1 text-xs">
              {JSON.stringify(agent.pendingApproval.arguments)}
            </code>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => void agent.respondToApproval(true)}
              >
                Approve once
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void agent.respondToApproval(false)}
              >
                Deny
              </Button>
            </div>
          </Alert>
        ) : null}
      </SectionPanel>
    </main>
  );
}
