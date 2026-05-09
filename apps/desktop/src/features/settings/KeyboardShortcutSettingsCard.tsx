import { useEffect, useState, type KeyboardEvent } from "react";
import { KeyboardIcon, RefreshCcwIcon } from "lucide-react";

import {
  PermissionCallout,
  SectionPanel,
  StatusBadge,
} from "@/components/app";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { normalizeError } from "@/lib/errors";
import {
  getHotkeyBindings,
  isTauriRuntime,
  saveDictationHotkey,
  type HotkeyBindings,
} from "@/lib/tauri";

const DEFAULT_BINDINGS: HotkeyBindings = {
  dictation: "Ctrl+Win",
  command: "Ctrl+Win+Alt",
};

export function KeyboardShortcutSettingsCard() {
  const [bindings, setBindings] = useState<HotkeyBindings>(DEFAULT_BINDINGS);
  const [draftShortcut, setDraftShortcut] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shortcutValidationError = validateShortcut(draftShortcut);
  const canSaveShortcut =
    Boolean(draftShortcut) && !shortcutValidationError && !isSaving;

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let cancelled = false;
    getHotkeyBindings()
      .then((loadedBindings) => {
        if (!cancelled) {
          setBindings(loadedBindings);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(normalizeError(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const openEditor = () => {
    setDraftShortcut(bindings.dictation);
    setError(null);
    setIsEditing(true);
  };

  const closeEditor = () => {
    setDraftShortcut("");
    setError(null);
    setIsEditing(false);
  };

  const saveShortcut = async (shortcut: string) => {
    setIsSaving(true);
    setError(null);

    try {
      const nextBindings = await saveDictationHotkey(shortcut);
      setBindings(nextBindings);
      setDraftShortcut("");
      setIsEditing(false);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SectionPanel
      title="Keyboard shortcut"
      description="Change the hold-to-talk shortcut used by the voice capsule."
      actions={<StatusBadge tone="neutral">Hold to talk</StatusBadge>}
      contentClassName="gap-3"
    >
      <div className="flex flex-col gap-3 rounded-lg border bg-card/60 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-sm font-medium text-foreground">
              Current dictation shortcut
            </p>
            <ShortcutKeys shortcut={bindings.dictation} />
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={openEditor}
          >
            <KeyboardIcon data-icon="inline-start" aria-hidden="true" />
            Change shortcut
          </Button>
        </div>
      </div>

      {isEditing ? (
        <FieldGroup>
          <Field data-invalid={Boolean(shortcutValidationError)}>
            <FieldLabel htmlFor="settings-dictation-shortcut">
              Press a new shortcut
            </FieldLabel>
            <Input
              id="settings-dictation-shortcut"
              aria-invalid={Boolean(shortcutValidationError)}
              autoFocus
              readOnly
              value={draftShortcut ? formatHotkeyLabel(draftShortcut) : ""}
              placeholder="Hold Ctrl + Win or Ctrl + Shift"
              onKeyDown={handleShortcutKeyDown(setDraftShortcut)}
            />
            <FieldDescription>
              Use at least two modifier keys. Alt stays reserved for command
              mode.
            </FieldDescription>
            {shortcutValidationError ? (
              <FieldDescription className="text-destructive">
                {shortcutValidationError}
              </FieldDescription>
            ) : null}
          </Field>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isSaving}
              onClick={() => void saveShortcut(DEFAULT_BINDINGS.dictation)}
            >
              <RefreshCcwIcon data-icon="inline-start" aria-hidden="true" />
              Reset to default
            </Button>
            <div className="flex flex-wrap items-center gap-2">
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
            </div>
          </div>
        </FieldGroup>
      ) : null}

      {error ? (
        <PermissionCallout tone="warning" title="Shortcut update failed">
          {error}
        </PermissionCallout>
      ) : null}
    </SectionPanel>
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
          <kbd className="rounded-md border border-border bg-background px-2.5 py-1 text-sm font-medium text-foreground shadow-sm">
            {part}
          </kbd>
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
    return "Alt stays reserved for command mode.";
  }

  return null;
}

function formatHotkeyLabel(shortcut: string) {
  return shortcut.replace(/\+/g, " + ");
}
