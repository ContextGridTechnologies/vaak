import { useState } from "react";
import {
  Alert,
  Button,
  Field,
  JsonPreview,
  PageShell,
  Panel,
} from "../components";
import { normalizeError } from "../lib/errors";
import {
  captureAndInsert,
  type FocusedFieldInfo,
  isTauriRuntime,
  minimizeCurrentWindow,
  type TextInsertResult,
} from "../lib/tauri";
import { DictationPanel } from "../features/dictation";
import "../styles/app.css";

function App() {
  const tauriAvailable = isTauriRuntime();
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
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setInsertBusy(false);
    }
  };

  return (
    <PageShell
      eyebrow="Desktop Spike"
      title="Phase 1 + 2: Windows Spike and Dictation"
      subtitle="Debug panels for focus, insertion, and audio capture."
      notice={
        !tauriAvailable ? (
          <Alert variant="info">
            Running in browser preview mode. Dictation capture works, but
            native focus and text insertion require `npm run tauri dev`.
          </Alert>
        ) : null
      }
    >
      <DictationPanel />

      <Panel
        title="Focused Field"
        description="Inspect the active control captured before insertion."
      >
        <JsonPreview
          value={focusedField}
          emptyMessage='Use "Capture + Insert" to capture the focused element.'
        />
      </Panel>

      <Panel
        title="Text Insertion"
        description="Capture the active field and push a sample string into it."
        actions={
          <Button
            onClick={handleInsert}
            disabled={insertBusy || !tauriAvailable}
          >
            {insertBusy ? "Capturing..." : "Capture + Insert"}
          </Button>
        }
      >
        <Alert variant="info">
          This minimizes the app so the target field keeps focus during
          capture.
        </Alert>
        <Field label="Text to insert">
          <textarea
            className="input input--multiline"
            value={insertValue}
            onChange={(event) => setInsertValue(event.target.value)}
            rows={3}
            placeholder="Type some sample text"
          />
        </Field>
        {insertResult && (
          <Alert variant="success">
            Inserted via <strong>{insertResult.method}</strong> (
            {insertResult.characters} characters).
          </Alert>
        )}
      </Panel>

      {error && <Alert variant="error">{error}</Alert>}
    </PageShell>
  );
}

export default App;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
