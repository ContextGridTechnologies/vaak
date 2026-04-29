import { PermissionCallout } from "@/components/app";
import type { FocusedFieldInfo } from "@/lib/tauri";

type FocusTargetSummaryProps = {
  focusedField: FocusedFieldInfo | null;
};

export function FocusTargetSummary({ focusedField }: FocusTargetSummaryProps) {
  if (!focusedField) {
    return null;
  }

  return (
    <PermissionCallout tone="success">
      Target field: <strong>{focusedField.controlName || "Unnamed"}</strong>
      {" in "}
      <strong>{focusedField.windowTitle || "Unknown window"}</strong>
    </PermissionCallout>
  );
}
