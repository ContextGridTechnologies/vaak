import { SectionPanel } from "@/components/app";
import {
  AudioPlayback,
  DeviceSelector,
  DictationControls,
  DictationDiagnostics,
  FocusTargetSummary,
  RecordingStatus,
} from "./components";
import { useDictationSession } from "./hooks/useDictationSession";

export function DictationPanel() {
  const {
    activeMode,
    audioUrl,
    deviceError,
    deviceOptions,
    durationLabel,
    fallbackNotice,
    focusedField,
    focusedFieldError,
    hasPermission,
    hotkeyBindings,
    isLoading,
    isRecording,
    isWindows,
    recorderError,
    refresh,
    requestPermission,
    reset,
    selectedDeviceId,
    selectedLabel,
    selectDevice,
    startManualDictation,
    status,
    statusLabel,
    stopManualRecording,
    tauriAvailable,
  } = useDictationSession();

  return (
    <SectionPanel
      title="Dictation Capture"
      description="Capture microphone audio locally for Phase 2 testing."
      actions={
        <DictationControls
          isRecording={isRecording}
          status={status}
          hasAudio={Boolean(audioUrl)}
          onToggleRecording={
            isRecording ? stopManualRecording : startManualDictation
          }
          onReset={reset}
        />
      }
    >
        <DictationDiagnostics
          isWindows={isWindows}
          tauriAvailable={tauriAvailable}
          hotkeyBindings={hotkeyBindings}
          fallbackNotice={fallbackNotice}
          focusedFieldError={focusedFieldError}
          deviceError={deviceError}
          recorderError={recorderError}
        />
        <DeviceSelector
          deviceOptions={deviceOptions}
          selectedDeviceId={selectedDeviceId}
          isLoading={isLoading}
          hasPermission={hasPermission}
          onSelectDevice={selectDevice}
          onRefresh={refresh}
          onRequestPermission={requestPermission}
        />
        <RecordingStatus
          activeMode={activeMode}
          status={status}
          statusLabel={statusLabel}
          durationLabel={durationLabel}
          isRecording={isRecording}
          selectedLabel={selectedLabel}
          hasPermission={hasPermission}
        />
        <FocusTargetSummary focusedField={focusedField} />
        <AudioPlayback audioUrl={audioUrl} />
    </SectionPanel>
  );
}
