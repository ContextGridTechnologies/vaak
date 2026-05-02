import { EmptyState, SectionPanel, StatusBadge } from "@/components/app";

export function AccountPanel() {
  return (
    <SectionPanel
      title="Account"
      description="Sync, team, and managed features will arrive later."
      actions={<StatusBadge tone="neutral">Coming soon</StatusBadge>}
    >
      <EmptyState
        title="Local dictation stays available without sign-in."
        description="When account features are ready, this section will handle sync and managed access without changing the local-first workflow."
        className="min-h-56 border-border/70 bg-muted/15"
      />
    </SectionPanel>
  );
}
