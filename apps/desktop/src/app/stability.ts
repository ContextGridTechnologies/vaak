import {
  isTauriRuntime,
  recordRendererError,
  recordRendererHeartbeat,
} from "@/lib/tauri";

const HEARTBEAT_INTERVAL_MS = 5_000;

export function installRendererStabilityHooks(windowLabel: string): () => void {
  if (!isTauriRuntime()) {
    return () => {};
  }

  const sendHeartbeat = () => {
    void recordRendererHeartbeat(windowLabel).catch(() => {});
  };

  const reportError = (
    message: string,
    source?: string,
    line?: number,
    column?: number,
  ) => {
    void recordRendererError({
      windowLabel,
      message,
      source,
      line,
      column,
    }).catch(() => {});
  };

  const errorListener = (event: ErrorEvent) => {
    reportError(
      event.message || event.error?.message || "Unhandled renderer error",
      event.filename || undefined,
      event.lineno || undefined,
      event.colno || undefined,
    );
  };

  const rejectionListener = (event: PromiseRejectionEvent) => {
    reportError(`Unhandled promise rejection: ${normalizeReason(event.reason)}`);
  };

  sendHeartbeat();
  const intervalId = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  window.addEventListener("error", errorListener);
  window.addEventListener("unhandledrejection", rejectionListener);

  return () => {
    window.clearInterval(intervalId);
    window.removeEventListener("error", errorListener);
    window.removeEventListener("unhandledrejection", rejectionListener);
  };
}

function normalizeReason(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message;
  }
  if (typeof reason === "string") {
    return reason;
  }

  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}
