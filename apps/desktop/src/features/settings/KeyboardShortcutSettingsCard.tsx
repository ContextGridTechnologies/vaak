import { useEffect, useState, type KeyboardEvent } from "react";
import { KeyboardIcon, RefreshCcwIcon } from "lucide-react";

import { PermissionCallout } from "@/components/app";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  alternateDictationShortcutLabel,
  currentDesktopPlatform,
  defaultHotkeyBindingsForPlatform,
  reservedCommandModifierLabel,
  shortcutFromModifierEvent,
  type DesktopPlatform,
} from "@/lib/desktop-hotkeys";
import { normalizeError } from "@/lib/errors";
import {
  getHotkeyBindings,
  isTauriRuntime,
  saveDictationHotkey,
  type HotkeyBindings,
} from "@/lib/tauri";

export function KeyboardShortcutSettingsCard() {
  const [desktopPlatform] = useState<DesktopPlatform>(() =>
    currentDesktopPlatform(),
  );
  const [defaultBindings] = useState<HotkeyBindings>(() =>
    defaultHotkeyBindingsForPlatform(desktopPlatform),
  );
  const [bindings, setBindings] = useState<HotkeyBindings>(defaultBindings);
  const [draftShortcut, setDraftShortcut] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shortcutValidationError = validateShortcut(draftShortcut);
  const canSaveShortcut =
    Boolean(draftShortcut) && !shortcutValidationError && !isSaving;
  const reservedCommandModifier = reservedCommandModifierLabel(desktopPlatform);

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
    <Card size="sm" className="rounded-lg bg-transparent py-0 shadow-none ring-0">
      <CardContent className="px-0">
        <FieldGroup className="gap-0">
          <Separator className="mb-6 bg-border/70" />

          <section
            aria-labelledby="keyboard-shortcut-heading"
            className="flex flex-col gap-4"
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3
                  id="keyboard-shortcut-heading"
                  className="text-base font-semibold text-foreground"
                >
                  Shortcut
                </h3>
                <p className="text-sm text-muted-foreground">
                  Choose the key combination used for hold-to-talk.
                </p>
              </div>
              <p className="text-right text-sm font-medium text-muted-foreground">
                Hold to talk
              </p>
            </div>

            <div className="flex flex-col gap-3 rounded-md border border-border/70 bg-background/70 p-4 sm:flex-row sm:items-center sm:justify-between">
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
                className="w-fit sm:shrink-0"
                onClick={openEditor}
              >
                <KeyboardIcon data-icon="inline-start" aria-hidden="true" />
                Change shortcut
              </Button>
            </div>
          </section>

          {isEditing ? (
            <FieldGroup className="pt-4">
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
                  placeholder={`Hold ${formatHotkeyLabel(defaultBindings.dictation)} or ${alternateDictationShortcutLabel(
                    desktopPlatform,
                  )}`}
                  onKeyDown={handleShortcutKeyDown(
                    setDraftShortcut,
                    desktopPlatform,
                  )}
                />
                <FieldDescription>
                  Use at least two modifier keys. {reservedCommandModifier} stays
                  reserved for command mode.
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
                  onClick={() => void saveShortcut(defaultBindings.dictation)}
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
            <div className="pt-4">
              <PermissionCallout tone="warning" title="Shortcut update failed">
                {error}
              </PermissionCallout>
            </div>
          ) : null}
        </FieldGroup>
      </CardContent>
    </Card>
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
  desktopPlatform: DesktopPlatform,
) {
  return (event: KeyboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const nextShortcut = shortcutFromModifierEvent(event, desktopPlatform);
    if (nextShortcut) {
      setDraftShortcut(nextShortcut);
    }
  };
}

function validateShortcut(shortcut: string) {
  if (!shortcut) {
    return null;
  }

  const parts = shortcut.split("+").filter(Boolean);

  if (parts.length < 2) {
    return "Use at least two modifier keys.";
  }

  if (parts.includes("Alt") || parts.includes("Option")) {
    return `${parts.includes("Option") ? "Option" : "Alt"} stays reserved for command mode.`;
  }

  return null;
}

function formatHotkeyLabel(shortcut: string) {
  return shortcut.replace(/\+/g, " + ");
}
