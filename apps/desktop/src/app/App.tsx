import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  captureAndInsert,
  type FocusedFieldInfo,
  type TextInsertResult,
} from "../lib/tauri";
import { DictationPanel } from "../features/dictation";
import "../styles/app.css";

function App() {
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
      const appWindow = getCurrentWindow();
      await appWindow.minimize();
      await sleep(350);
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
    <main className="container">
      <header className="header">
        <div>
          <h1>Phase 1 + 2: Windows Spike and Dictation</h1>
          <p className="subtitle">
            Debug panels for focus, insertion, and audio capture.
          </p>
        </div>
      </header>

      <DictationPanel />

      <section className="panel">
        <div className="panel-header">
          <h2>Focused Field</h2>
        </div>
        <div className="panel-body">
          {focusedField ? (
            <pre>{JSON.stringify(focusedField, null, 2)}</pre>
          ) : (
            <p className="placeholder">
              Use "Capture + Insert" to capture the focused element.
            </p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Text Insertion</h2>
          <button onClick={handleInsert} disabled={insertBusy}>
            {insertBusy ? "Capturing..." : "Capture + Insert"}
          </button>
        </div>
        <div className="panel-body">
          <p className="hint">
            This will minimize the app so the target field keeps focus during
            capture.
          </p>
          <label className="field">
            <span>Text to insert</span>
            <textarea
              value={insertValue}
              onChange={(event) => setInsertValue(event.target.value)}
              rows={3}
              placeholder="Type some sample text"
            />
          </label>
          {insertResult && (
            <div className="result">
              Inserted via <strong>{insertResult.method}</strong> (
              {insertResult.characters} characters).
            </div>
          )}
        </div>
      </section>

      {error && <div className="error">{error}</div>}
    </main>
  );
}

export default App;

function normalizeError(err: unknown): string {
  if (typeof err === "string") {
    return err;
  }
  if (err && typeof err === "object") {
    const maybeMessage = (err as { message?: string }).message;
    const maybeCode = (err as { code?: string }).code;
    if (maybeCode && maybeMessage) {
      return `${maybeCode}: ${maybeMessage}`;
    }
    if (maybeMessage) {
      return maybeMessage;
    }
  }
  return "Unknown error";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
