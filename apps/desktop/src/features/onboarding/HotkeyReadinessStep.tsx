import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  CheckCircle2Icon,
  KeyboardIcon,
  MicIcon,
  RefreshCcwIcon,
} from "lucide-react";

import { PermissionCallout } from "@/components/app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDictationSession } from "@/features/dictation/hooks/useDictationSession";
import { normalizeError } from "@/lib/errors";
import { saveDictationHotkey, type HotkeyBindings } from "@/lib/tauri";

import {
  OnboardingActionBar,
  OnboardingProgressHeader,
  OnboardingShell,
} from "./components";

type HotkeyReadinessStepProps = {
  error: string | null;
  onBack: () => void;
  onContinue: () => void;
};

export function HotkeyReadinessStep({
  error,
  onBack,
  onContinue,
}: HotkeyReadinessStepProps) {
  const {
    activeMode,
    deviceError,
    focusedFieldError,
    hasPermission,
    hotkeyBindings,
    isWindows,
    recorderError,
    requestPermission,
    reset,
    status,
    tauriAvailable,
  } = useDictationSession({ processingEnabled: false });
  const [savedBindings, setSavedBindings] = useState<HotkeyBindings | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draftShortcut, setDraftShortcut] = useState("");
  const [editorError, setEditorError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [testArmed, setTestArmed] = useState(false);
  const [hasSeenRecording, setHasSeenRecording] = useState(false);
  const [hotkeyVerified, setHotkeyVerified] = useState(false);
  const bindings = savedBindings ?? hotkeyBindings;
  const shortcutLabel = formatHotkeyLabel(bindings.dictation);
  const combinedError =
    editorError ?? recorderError ?? focusedFieldError ?? deviceError ?? error;
  const runtimeWarning = !isWindows
    ? "This shortcut test currently targets the Windows desktop build."
    : !tauriAvailable
      ? "Global shortcuts are available only in the desktop app."
      : null;
  const isListening =
    testArmed && activeMode === "dictation" && status === "recording";
  const isFailure = Boolean(combinedError) && testArmed && !isListening && !hotkeyVerified;
  const shortcutValidationError = validateShortcut(draftShortcut);
  const canSaveShortcut =
    Boolean(draftShortcut) && !shortcutValidationError && !isSaving;

  useEffect(() => {
    if (!testArmed || hotkeyVerified) {
      return;
    }

    if (activeMode === "dictation" && status === "recording") {
      setHasSeenRecording(true);
      return;
    }

    if (hasSeenRecording && status === "stopped") {
      setHotkeyVerified(true);
    }
  }, [activeMode, hasSeenRecording, hotkeyVerified, status, testArmed]);

  const openEditor = () => {
    setDraftShortcut(bindings.dictation);
    setEditorError(null);
    setIsEditing(true);
  };

  const closeEditor = () => {
    setDraftShortcut("");
    setEditorError(null);
    setIsEditing(false);
  };

  const startGuidedTest = () => {
    reset();
    setEditorError(null);
    setHotkeyVerified(false);
    setHasSeenRecording(false);
    setTestArmed(true);

    if (!hasPermission) {
      void requestPermission();
    }
  };

  const saveShortcut = async (shortcut: string) => {
    setIsSaving(true);
    setEditorError(null);

    try {
      const nextBindings = await saveDictationHotkey(shortcut);
      setSavedBindings(nextBindings);
      setHotkeyVerified(false);
      setHasSeenRecording(false);
      setTestArmed(false);
      setDraftShortcut("");
      setIsEditing(false);
    } catch (err) {
      setEditorError(normalizeError(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <OnboardingShell
      header={
        <OnboardingProgressHeader
          step={4}
          totalSteps={4}
          title="Set your hold-to-talk shortcut"
          description="Pick the shortcut you want to hold when you speak, then verify it once."
        />
      }
      footerHint="Shortcut settings can be changed later in Settings."
      contentClassName="max-w-[44rem]"
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 rounded-[1.75rem] border border-border/70 bg-card/85 p-4 shadow-sm sm:p-5">
        <div className="rounded-[1.25rem] border border-border/70 bg-background/85 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Current shortcut
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <ShortcutKeys shortcut={bindings.dictation} />
              </div>
            </div>

            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0 text-sm text-muted-foreground"
              onClick={openEditor}
            >
              Change shortcut
            </Button>
          </div>

          {isEditing ? (
            <div className="mt-4 rounded-[1rem] border border-border/70 bg-card/70 p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  Press a new shortcut
                </p>
                <p className="text-sm text-muted-foreground">
                  Use at least two modifier keys. Keep Alt free so Vaak can derive the
                  command shortcut separately.
                </p>
              </div>

              <Input
                aria-label="Press new shortcut"
                autoFocus
                readOnly
                className="mt-3"
                value={draftShortcut ? formatHotkeyLabel(draftShortcut) : ""}
                placeholder="Hold Ctrl + Win or Ctrl + Shift"
                onKeyDown={handleShortcutKeyDown(setDraftShortcut)}
              />

              {shortcutValidationError ? (
                <p className="mt-2 text-sm text-destructive" role="alert">
                  {shortcutValidationError}
                </p>
              ) : null}

              <OnboardingActionBar
                align="between"
                className="mt-4"
                primaryAction={
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isSaving}
                    onClick={() => void saveShortcut("Ctrl+Win")}
                  >
                    <RefreshCcwIcon className="size-4" aria-hidden="true" />
                    Reset to default
                  </Button>
                }
                secondaryAction={
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isSaving}
                      onClick={closeEditor}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!canSaveShortcut}
                      onClick={() => void saveShortcut(draftShortcut)}
                    >
                      Save shortcut
                    </Button>
                  </>
                }
              />
            </div>
          ) : null}
        </div>

        <div className="rounded-[1.25rem] border border-border/70 bg-background/90 p-5">
          <div className="flex flex-col gap-4">
            {hotkeyVerified ? (
              <GuidedState
                icon={<CheckCircle2Icon className="size-5 text-emerald-600" aria-hidden="true" />}
                eyebrow="Shortcut test passed"
                title="Continue into Vaak"
                description="Vaak detected the hold-to-talk shortcut and completed a microphone capture cycle."
              />
            ) : isListening ? (
              <GuidedState
                icon={<MicIcon className="size-5 text-primary" aria-hidden="true" />}
                eyebrow="Listening"
                title={`Now hold ${shortcutLabel} and speak`}
                description="Keep holding the shortcut until Vaak finishes listening, then release it to end the test."
                accent="active"
              />
            ) : testArmed ? (
              <GuidedState
                icon={<KeyboardIcon className="size-5 text-primary" aria-hidden="true" />}
                eyebrow={isFailure ? "Try again" : "Ready to test"}
                title={
                  isFailure
                    ? "That test did not finish"
                    : `Now hold ${shortcutLabel} and speak`
                }
                description={
                  isFailure
                    ? combinedError ?? "Try the shortcut again."
                    : hasPermission
                      ? "Press and hold the shortcut once so Vaak can start listening."
                      : "Allow microphone access if prompted, then hold the shortcut and speak."
                }
              />
            ) : (
              <GuidedState
                icon={<KeyboardIcon className="size-5 text-primary" aria-hidden="true" />}
                eyebrow="Next step"
                title={`Test with ${shortcutLabel}`}
                description="Hold the shortcut once so Vaak can verify the real microphone capture path."
              />
            )}

            {runtimeWarning ? (
              <PermissionCallout tone="warning" title="Desktop runtime required">
                {runtimeWarning}
              </PermissionCallout>
            ) : null}

            {!runtimeWarning && combinedError && !testArmed ? (
              <PermissionCallout tone="warning" title="Needs attention">
                {combinedError}
              </PermissionCallout>
            ) : null}

            <OnboardingActionBar
              align="between"
              primaryAction={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onBack}
                >
                  Back
                </Button>
              }
              secondaryAction={
                hotkeyVerified ? (
                  <Button type="button" size="sm" onClick={onContinue}>
                    Continue
                  </Button>
                ) : !testArmed || isFailure ? (
                  <Button type="button" size="sm" onClick={startGuidedTest}>
                    {isFailure ? "Try again" : `Test with ${shortcutLabel}`}
                  </Button>
                ) : null
              }
            />
          </div>
        </div>
      </div>
    </OnboardingShell>
  );
}

function GuidedState({
  accent = "idle",
  description,
  eyebrow,
  icon,
  title,
}: {
  accent?: "active" | "idle";
  description: string;
  eyebrow: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div
      className={
        accent === "active"
          ? "rounded-[1rem] border border-primary/30 bg-primary/5 p-4"
          : "rounded-[1rem] border border-border/70 bg-card/60 p-4"
      }
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-background shadow-sm">
          {icon}
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {eyebrow}
          </p>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

function ShortcutKeys({ shortcut }: { shortcut: string }) {
  const parts = shortcut.split("+").filter(Boolean);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {parts.map((part, index) => (
        <div key={`${part}-${index}`} className="flex items-center gap-2">
          {index > 0 ? (
            <span className="text-sm font-medium text-muted-foreground">+</span>
          ) : null}
          <span className="rounded-md border border-border bg-card px-2.5 py-1 text-sm font-medium text-foreground shadow-sm">
            {part}
          </span>
        </div>
      ))}
    </div>
  );
}

function handleShortcutKeyDown(
  setDraftShortcut: (shortcut: string) => void,
) {
  return (event: KeyboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const nextShortcut = shortcutFromKeyEvent(event);
    if (nextShortcut) {
      setDraftShortcut(nextShortcut);
    }
  };
}

function shortcutFromKeyEvent(event: KeyboardEvent<HTMLInputElement>) {
  const parts: string[] = [];

  if (event.ctrlKey) {
    parts.push("Ctrl");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }
  if (event.metaKey) {
    parts.push("Win");
  }
  if (event.altKey) {
    parts.push("Alt");
  }

  return parts.join("+");
}

function validateShortcut(shortcut: string) {
  if (!shortcut) {
    return null;
  }

  const parts = shortcut.split("+").filter(Boolean);

  if (parts.length < 2) {
    return "Use at least two modifier keys.";
  }

  if (parts.includes("Alt")) {
    return "Alt stays reserved for the command shortcut.";
  }

  return null;
}

function formatHotkeyLabel(shortcut: string) {
  return shortcut.replace(/\+/g, " + ");
}
