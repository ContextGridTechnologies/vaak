import { EmptyState, SectionPanel } from "@/components/app";

export function SettingsPanel() {
  return (
    <SectionPanel
      title="Settings"
      description="Microphone, hotkey, provider, and app preferences."
    >
      <EmptyState
        title="Settings are not configured yet"
        description="Provider, permission, hotkey, and microphone preferences will live here."
      />
    </SectionPanel>
  );
}
