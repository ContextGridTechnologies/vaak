type AudioPlaybackProps = {
  audioUrl: string | null;
};

export function AudioPlayback({ audioUrl }: AudioPlaybackProps) {
  if (!audioUrl) {
    return null;
  }

  return (
    <audio className="w-full" controls src={audioUrl}>
      <track
        kind="captions"
        src="data:text/vtt,WEBVTT"
        srcLang="en"
        label="captions"
        default
      />
      Your browser does not support the audio element.
    </audio>
  );
}
