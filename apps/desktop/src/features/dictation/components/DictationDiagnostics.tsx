import { PermissionCallout } from "@/components/app";
import type { HotkeyBindings } from "@/lib/tauri";

type DictationDiagnosticsProps = {
  desktopHotkeysSupported: boolean;
  tauriAvailable: boolean;
  hotkeyBindings: HotkeyBindings;
  fallbackNotice: string | null;
  focusedFieldError: string | null;
  deviceError: string | null;
  recorderError: string | null;
};

export function DictationDiagnostics({
  desktopHotkeysSupported,
  tauriAvailable,
  hotkeyBindings,
  fallbackNotice,
  focusedFieldError,
  deviceError,
  recorderError,
}: DictationDiagnosticsProps) {
  return (
    <>
      {desktopHotkeysSupported && (
        <PermissionCallout>
          {tauriAvailable
            ? `Global hotkeys: hold ${hotkeyBindings.dictation} for dictation, hold ${hotkeyBindings.command} for command mode.`
            : "Global hotkeys are available only in the Tauri desktop shell."}
        </PermissionCallout>
      )}
      {fallbackNotice && (
        <PermissionCallout tone="warning">{fallbackNotice}</PermissionCallout>
      )}
      {focusedFieldError && (
        <PermissionCallout tone="error">{focusedFieldError}</PermissionCallout>
      )}
      {deviceError && (
        <PermissionCallout tone="error">{deviceError}</PermissionCallout>
      )}
      {recorderError && (
        <PermissionCallout tone="error">{recorderError}</PermissionCallout>
      )}
    </>
  );
}
