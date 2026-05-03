import { CloudOffIcon, KeyRoundIcon, MicIcon } from "lucide-react";

import {
  FeatureTile,
  SetupChecklist,
  StatusBadge,
  type SetupChecklistItem,
} from "@/components/app";
import { ProviderSetupGrid } from "@/features/providers";

import { SyncPlaceholder } from "./SyncPlaceholder";

type VoiceSetupPanelProps = {
  hasMicrophonePermission: boolean;
  tauriAvailable: boolean;
};

export function VoiceSetupPanel({
  hasMicrophonePermission,
  tauriAvailable,
}: VoiceSetupPanelProps) {
  const setupItems = getSetupItems({
    hasMicrophonePermission,
    tauriAvailable,
  });

  return (
    <div className="flex flex-col gap-3">
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <div className="min-w-0">
            <h2 className="text-base font-medium leading-snug text-foreground">
              Configure your voice layer
            </h2>
            <p className="text-sm text-muted-foreground">
              Set up microphone access, choose your providers, then dictate into
              any app.
            </p>
          </div>
        </div>
        <div className="grid gap-2.5 md:grid-cols-3">
          <FeatureTile
            icon={MicIcon}
            title="Dictate anywhere"
            description="Capture speech and prepare it for the app already in focus."
          />
          <FeatureTile
            icon={KeyRoundIcon}
            title="Bring your providers"
            description="Start with local setup for OpenAI, AssemblyAI, ElevenLabs, or Smallest AI."
          />
          <FeatureTile
            icon={CloudOffIcon}
            title="Local-first by default"
            description="Core setup does not require a Vaak account or backend."
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge tone="success">Local mode active</StatusBadge>
          <StatusBadge tone="neutral">Provider setup next</StatusBadge>
          <StatusBadge tone="neutral">Floating capture planned</StatusBadge>
        </div>
        <SetupChecklist items={setupItems} />
      </section>
      <ProviderSetupGrid />
      <SyncPlaceholder />
    </div>
  );
}

function getSetupItems({
  hasMicrophonePermission,
  tauriAvailable,
}: VoiceSetupPanelProps): SetupChecklistItem[] {
  return [
    {
      id: "microphone",
      title: "Microphone",
      description: hasMicrophonePermission
        ? "Audio capture permission is available."
        : "Grant microphone access to capture dictation audio.",
      status: hasMicrophonePermission ? "complete" : "blocked",
      statusLabel: hasMicrophonePermission ? "Ready" : "Needs access",
    },
    {
      id: "speech-provider",
      title: "Speech provider",
      description: "Choose OpenAI, AssemblyAI, ElevenLabs, or Smallest AI for transcription.",
      status: "pending",
      statusLabel: "Not configured",
    },
    {
      id: "rewrite-provider",
      title: "Rewrite provider",
      description: "Choose the model that turns transcripts into polished text.",
      status: "pending",
      statusLabel: "Not configured",
    },
    {
      id: "text-insertion",
      title: "Text insertion",
      description: tauriAvailable
        ? "Desktop insertion capabilities are available."
        : "Run the Tauri app to insert text into other desktop apps.",
      status: tauriAvailable ? "complete" : "blocked",
      statusLabel: tauriAvailable ? "Available" : "Desktop required",
    },
  ];
}
