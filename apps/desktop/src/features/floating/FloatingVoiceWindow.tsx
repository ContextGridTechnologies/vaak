import { useEffect } from "react";

import { VoiceCapsule } from "./VoiceCapsule";
import { useVoiceCapsuleDictation } from "./useVoiceCapsuleDictation";
import { useVoiceCapsuleDrag } from "./useVoiceCapsuleDrag";

export function FloatingVoiceWindow() {
  const { dictation, session } = useVoiceCapsuleDictation();
  const drag = useVoiceCapsuleDrag();

  useEffect(() => {
    document.documentElement.dataset.window = "voice-capsule";
    document.body.dataset.window = "voice-capsule";
    document.documentElement.classList.add("dark");
    document.body.classList.add("dark");

    return () => {
      document.documentElement.classList.remove("dark");
      document.body.classList.remove("dark");
    };
  }, []);

  const state = dictation.state;
  const isRecording = state === "recording";
  const isBusy = state === "transcribing" || state === "inserting";

  const handleToggleRecording = () => {
    if (drag.consumeSuppressedClick() || isBusy) {
      return;
    }

    if (isRecording) {
      session.stopManualRecording();
      return;
    }

    void session.startManualDictation();
  };

  return (
    <VoiceCapsule
      audioLevel={session.audioLevel ?? 0}
      message={drag.movementError ?? dictation.message}
      onToggleRecording={handleToggleRecording}
      state={drag.movementError ? "error" : state}
      {...drag.pointerHandlers}
    />
  );
}
