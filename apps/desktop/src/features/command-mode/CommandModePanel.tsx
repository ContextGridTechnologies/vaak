import { EmptyState, SectionPanel } from "@/components/app";

export function CommandModePanel() {
  return (
    <SectionPanel
      title="Command Mode"
      description="Voice commands and BTC workflow actions."
    >
      <EmptyState
        title="Command mode is not configured yet"
        description="This section is reserved for voice commands and BTC workflow actions."
      />
    </SectionPanel>
  );
}
