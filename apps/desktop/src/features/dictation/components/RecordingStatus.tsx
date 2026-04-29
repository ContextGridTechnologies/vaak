import { StatusBadge } from "@/components/app";
import type { RecorderStatus } from "@/hooks/useAudioRecorder";

type RecordingStatusProps = {
  activeMode: "idle" | "dictation" | "command";
  status: RecorderStatus;
  statusLabel: string;
  durationLabel: string;
  isRecording: boolean;
  selectedLabel: string;
  hasPermission: boolean;
};

export function RecordingStatus({
  activeMode,
  status,
  statusLabel,
  durationLabel,
  isRecording,
  selectedLabel,
  hasPermission,
}: RecordingStatusProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm text-muted-foreground">
        Active mode: <strong>{activeMode}</strong>
      </div>
      <div className="text-sm text-muted-foreground">
        Selected: <strong>{selectedLabel}</strong>
        {!hasPermission && " (labels hidden until permission is granted)"}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge tone={status}>{statusLabel}</StatusBadge>
        <span className="text-muted-foreground">
          {isRecording ? "Recording..." : "Last capture"} {durationLabel}
        </span>
      </div>
    </div>
  );
}
