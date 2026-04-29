import { useState } from "react";

import {
  JsonPreview,
  PermissionCallout,
  SectionPanel,
} from "@/components/app";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { normalizeError } from "@/lib/errors";
import {
  captureAndInsert,
  type FocusedFieldInfo,
  minimizeCurrentWindow,
  type TextInsertResult,
} from "@/lib/tauri";
import { toast } from "sonner";

type DiagnosticsPanelProps = {
  tauriAvailable: boolean;
};

export function DiagnosticsPanel({ tauriAvailable }: DiagnosticsPanelProps) {
  const [focusedField, setFocusedField] = useState<FocusedFieldInfo | null>(
    null,
  );
  const [insertValue, setInsertValue] = useState("Hello from BlueVoice");
  const [insertResult, setInsertResult] = useState<TextInsertResult | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [insertBusy, setInsertBusy] = useState(false);

  const handleInsert = async () => {
    setInsertBusy(true);
    setError(null);
    try {
      await minimizeCurrentWindow();
      if (tauriAvailable) {
        await sleep(350);
      }
      const result = await captureAndInsert(insertValue);
      setFocusedField(result.field);
      setInsertResult(result.insert);
      toast.success("Text inserted", {
        description: `${result.insert.characters} characters via ${result.insert.method}.`,
      });
    } catch (err) {
      const message = normalizeError(err);
      setError(message);
      toast.error("Text insertion failed", {
        description: message,
      });
    } finally {
      setInsertBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionPanel
        title="Focused Field"
        description="Inspect the active control captured before insertion."
      >
        <JsonPreview
          value={focusedField}
          emptyMessage='Use "Capture + Insert" to capture the focused element.'
        />
      </SectionPanel>

      <SectionPanel
        title="Text Insertion"
        description="Capture the active field and push a sample string into it."
        actions={
          <Button
            onClick={handleInsert}
            disabled={insertBusy || !tauriAvailable}
          >
            {insertBusy ? <Spinner data-icon="inline-start" /> : null}
            {insertBusy ? "Capturing..." : "Capture + Insert"}
          </Button>
        }
      >
        {tauriAvailable ? (
          <PermissionCallout>
            The app minimizes before capture so the target field keeps focus.
          </PermissionCallout>
        ) : (
          <PermissionCallout tone="warning">
            Text insertion is disabled in browser preview. Run the Tauri shell
            to test native focus capture and insertion.
          </PermissionCallout>
        )}
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="insert-value">Text to insert</FieldLabel>
            <Textarea
              id="insert-value"
              value={insertValue}
              onChange={(event) => setInsertValue(event.target.value)}
              rows={3}
              placeholder="Type some sample text"
            />
          </Field>
        </FieldGroup>
        {insertResult && (
          <PermissionCallout tone="success">
            Inserted via <strong>{insertResult.method}</strong> (
            {insertResult.characters} characters).
          </PermissionCallout>
        )}
      </SectionPanel>

      {error && <PermissionCallout tone="error">{error}</PermissionCallout>}
    </div>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
