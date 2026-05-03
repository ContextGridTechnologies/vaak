import { type FocusedFieldInfo } from "./focus";
import { invokeTauri } from "./runtime";

export type DictationTargetSnapshot = {
  stableId: string;
  windowTitle: string;
  controlName: string;
  controlType: string;
  controlTypeId: number;
  automationId: string;
  frameworkId: string;
  className: string;
  nativeWindowHandle: number;
  inputKind: "text" | "editor" | "terminal" | "browser" | "unknown";
  currentValue: string | null;
};

export type DictationProviderContext = {
  providerId: string;
  modelId: string | null;
};

export type DictationTranscript = {
  rawText: string;
  finalText: string;
  characterCount: number;
};

export type DictationInsertionOutcome = {
  status: "inserted" | "skipped" | "failed";
  method: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type DictationRecordingDiagnostics = {
  startupMs: number;
  streamAcquisitionMs: number;
  reusedWarmStream: boolean;
  analysisMs?: number;
  transcriptionMs?: number;
  insertionMs?: number;
  postProcessingMs?: number;
};

export type DictationAudioArtifact = {
  relativePath: string;
  mimeType: string;
  byteLength: number;
};

export type DictationRecordDraft = {
  sessionId?: string | null;
  mode: "dictation" | "command";
  trigger: "hotkey" | "manual" | "api";
  capturedAt: string;
  startedAt: string | null;
  endedAt: string | null;
  recording?: DictationRecordingDiagnostics | null;
  audio?: DictationAudioArtifact | null;
  processedAudio?: DictationAudioArtifact | null;
  target: DictationTargetSnapshot;
  provider: DictationProviderContext | null;
  transcript: DictationTranscript;
  insertion: DictationInsertionOutcome;
};

export type DictationRecord = DictationRecordDraft & {
  schemaVersion: 1;
  recordId: string;
  userId: string;
  installationId: string;
  deviceId: string;
  sessionId: string;
  platform: string;
};

export async function saveDictationRecord(
  draft: DictationRecordDraft,
): Promise<DictationRecord> {
  return invokeTauri("save_dictation_record", { draft });
}

export async function getRecentDictationRecords(
  limit = 12,
  offset = 0,
): Promise<DictationRecord[]> {
  return invokeTauri("get_recent_dictation_records", { limit, offset });
}

export async function persistDictationAudio(input: {
  audioBlob: Blob;
  capturedAt: string;
}): Promise<DictationAudioArtifact> {
  const buffer = await input.audioBlob.arrayBuffer();
  const audioBytes = Array.from(new Uint8Array(buffer));

  return invokeTauri("persist_dictation_audio", {
    audioBytes,
    capturedAt: input.capturedAt,
    mimeType: input.audioBlob.type || "audio/webm",
  });
}

export async function loadSavedDictationAudio(
  relativePath: string,
): Promise<{ audioBytes: Uint8Array; mimeType: string }> {
  const result = await invokeTauri<{
    audioBytes: number[];
    mimeType: string;
  }>("load_saved_dictation_audio", {
    relativePath,
  });

  return {
    audioBytes: new Uint8Array(result.audioBytes),
    mimeType: result.mimeType,
  };
}

type TargetLabelInput = {
  controlName: string;
  controlType: string;
  inputKind?: DictationTargetSnapshot["inputKind"];
  frameworkId?: string;
  className?: string;
};

const accessibilityPlaceholderFragments = [
  "not accessible at this time",
  "screen reader optimized mode",
  "shift+alt+f1",
  "terminal accessibility help",
  "toggle screen reader accessibility mode",
  "use alt+f1",
] as const;

export function targetSnapshotFromFocusedField(
  field: FocusedFieldInfo,
  inputKind: DictationTargetSnapshot["inputKind"] = "unknown",
): DictationTargetSnapshot {
  return {
    stableId: field.stableId,
    windowTitle: field.windowTitle,
    controlName: sanitizeTargetControlName({
      controlName: field.controlName,
      controlType: field.controlType,
      inputKind,
      frameworkId: field.frameworkId,
      className: field.className,
    }),
    controlType: field.controlType,
    controlTypeId: field.controlTypeId,
    automationId: field.automationId,
    frameworkId: field.frameworkId,
    className: field.className,
    nativeWindowHandle: field.nativeWindowHandle,
    inputKind,
    currentValue: null,
  };
}

export function sanitizeTargetControlName({
  controlName,
  controlType,
  inputKind = "unknown",
  frameworkId = "",
  className = "",
}: TargetLabelInput): string {
  const trimmed = controlName.trim();
  if (!trimmed) {
    return fallbackTargetLabel({ controlType, inputKind, frameworkId, className });
  }

  if (looksLikeAccessibilityPlaceholder(trimmed)) {
    return fallbackTargetLabel({ controlType, inputKind, frameworkId, className });
  }

  return trimmed;
}

function looksLikeAccessibilityPlaceholder(value: string): boolean {
  const normalized = value.toLowerCase();
  const matchCount = accessibilityPlaceholderFragments.filter((fragment) =>
    normalized.includes(fragment),
  ).length;

  return matchCount >= 2;
}

function fallbackTargetLabel(input: Omit<TargetLabelInput, "controlName">): string {
  if (input.inputKind === "editor" || input.controlType === "Document") {
    return "Editor";
  }

  if (input.inputKind === "terminal") {
    return "Command input";
  }

  if (input.inputKind === "browser") {
    return "Browser input";
  }

  if (input.inputKind === "text" || input.controlType === "Edit") {
    return "Text input";
  }

  const combinedHints = `${input.frameworkId} ${input.className}`.toLowerCase();
  if (
    combinedHints.includes("termcontrol") ||
    combinedHints.includes("terminal") ||
    combinedHints.includes("cascadia")
  ) {
    return "Command input";
  }

  return input.controlType.trim() || "Focused field";
}
