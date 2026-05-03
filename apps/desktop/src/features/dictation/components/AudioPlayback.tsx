import { DownloadIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

type AudioPlaybackProps = {
  audioUrl: string | null;
  onDownload?: () => void | Promise<void>;
};

export function AudioPlayback({
  audioUrl,
  onDownload,
}: AudioPlaybackProps) {
  if (!audioUrl) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <audio
        data-testid="audio-playback-element"
        className="w-full"
        controls
        controlsList="nodownload"
        src={audioUrl}
      >
        <track
          kind="captions"
          src="data:text/vtt,WEBVTT"
          srcLang="en"
          label="captions"
          default
        />
        Your browser does not support the audio element.
      </audio>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => {
            void onDownload?.();
          }}
          aria-label="Download audio"
        >
          <DownloadIcon data-icon="inline-start" />
          Download
        </Button>
      </div>
    </div>
  );
}
