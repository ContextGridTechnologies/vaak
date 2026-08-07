import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { recordStartupCheckpoint, setVoiceCapsuleSizeMode } from "@/lib/tauri";
import { VoiceCapsule } from "./VoiceCapsule";
import { useAssemblyAiVoiceAgent } from "./useAssemblyAiVoiceAgent";
import { useVoiceCapsuleDictation } from "./useVoiceCapsuleDictation";
import { useVoiceCapsuleDrag } from "./useVoiceCapsuleDrag";

export function FloatingVoiceWindow() {
  const { dictation, session } = useVoiceCapsuleDictation();
  const agent = useAssemblyAiVoiceAgent();
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
  const canRecoverInsertion =
    state === "error" &&
    dictation.error?.kind === "insertion" &&
    Boolean(dictation.transcript?.trim());

  useEffect(() => {
    void recordStartupCheckpoint({
      windowLabel: "voice-capsule",
      checkpoint: "voice_agent_control_state",
      detail: `agentState=${agent.state}_isRecording=${isRecording}_isBusy=${isBusy}`,
    }).catch(() => {});
  }, [agent.state, isBusy, isRecording]);

  const handleToggleRecording = () => {
    if (drag.consumeSuppressedClick() || isBusy || agent.isActive) {
      return;
    }

    if (isRecording) {
      session.stopManualRecording();
      return;
    }

    void session.startManualDictation();
  };

  const handleToggleAgent = () => {
    const dragSuppressed = drag.consumeSuppressedClick();
    void recordStartupCheckpoint({
      windowLabel: "voice-capsule",
      checkpoint: "voice_agent_button_clicked",
      detail: `agentState=${agent.state}_isRecording=${isRecording}_isBusy=${isBusy}_dragSuppressed=${dragSuppressed}`,
    }).catch(() => {});
    if (dragSuppressed || isRecording || isBusy) {
      return;
    }

    if (agent.isActive) {
      void agent.stop();
      return;
    }

    void agent.start();
  };

  useEffect(() => {
    if (!agent.pendingApproval) return;
    void setVoiceCapsuleSizeMode("insertionRecoveryOpen");
    return () => {
      void setVoiceCapsuleSizeMode("compact");
    };
  }, [agent.pendingApproval]);

  return (
    <div className="relative h-full w-full">
      <div className={agent.pendingApproval ? "h-9 w-14" : "h-full w-full"}>
        <VoiceCapsule
          audioLevel={session.audioLevel ?? 0}
          agentDisabled={isRecording || isBusy}
          agentState={agent.state}
          canRecoverInsertion={canRecoverInsertion}
          message={
            drag.movementError ??
            (agent.isActive || agent.state === "error"
              ? agent.message
              : dictation.message)
          }
          onToggleAgent={handleToggleAgent}
          onToggleRecording={handleToggleRecording}
          recordingDisabled={agent.isActive}
          state={drag.movementError ? "error" : state}
          transcript={dictation.transcript}
          {...drag.pointerHandlers}
        />
      </div>
      {agent.pendingApproval ? (
        <section className="absolute inset-x-1.5 top-10 rounded-lg border border-white/15 bg-neutral-950/96 p-3 text-white shadow-xl">
          <p className="text-sm font-medium">
            Approve {agent.pendingApproval.toolName}?
          </p>
          <p className="mt-1 text-xs text-white/65">
            {agent.pendingApproval.risk} Windows action · this call only
          </p>
          <code className="mt-1 block max-h-10 overflow-hidden break-all rounded bg-white/8 px-1.5 py-1 text-[10px] text-white/75">
            {JSON.stringify(agent.pendingApproval.arguments)}
          </code>
          <div className="mt-3 flex gap-2">
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
              variant="secondary"
              onClick={() => void agent.respondToApproval(false)}
            >
              Deny
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
