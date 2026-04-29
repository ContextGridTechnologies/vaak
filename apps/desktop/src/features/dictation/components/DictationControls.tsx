import { Button } from "@/components/ui/button";
import type { RecorderStatus } from "@/hooks/useAudioRecorder";

type DictationControlsProps = {
  isRecording: boolean;
  status: RecorderStatus;
  hasAudio: boolean;
  onToggleRecording: () => void;
  onReset: () => void;
};

export function DictationControls({
  isRecording,
  status,
  hasAudio,
  onToggleRecording,
  onReset,
}: DictationControlsProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button onClick={onToggleRecording} disabled={status === "error"}>
        {isRecording ? "Stop Recording" : "Start Recording"}
      </Button>
      <Button variant="secondary" onClick={onReset} disabled={!hasAudio}>
        {hasAudio ? "Clear" : "No Capture"}
      </Button>
    </div>
  );
}
