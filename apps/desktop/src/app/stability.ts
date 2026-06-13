import {
  isTauriRuntime,
  listenToTauriEvent,
  recordRendererError,
  recordRendererHeartbeat,
  recordStartupCheckpoint,
} from "@/lib/tauri";

const HEARTBEAT_INTERVAL_MS = 5_000;
const RENDERER_REOPEN_PROBE_EVENT = "vaak://renderer-reopen-probe";
let currentRendererInstanceId: string | undefined;

type RendererReopenProbePayload = {
  source?: string;
};

export function installRendererStabilityHooks(windowLabel: string): () => void {
  if (!isTauriRuntime()) {
    return () => {};
  }
  const rendererInstanceId = rendererInstanceIdForCurrentLoad();

  const sendHeartbeat = () => {
    void recordRendererHeartbeat(windowLabel, rendererInstanceId).catch(() => {});
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

  void recordStartupCheckpoint({
    windowLabel,
    checkpoint: "renderer_stability_hooks_installed",
    detail: `heartbeat_interval_ms=${HEARTBEAT_INTERVAL_MS} rendererInstanceId=${rendererInstanceId}`,
  }).catch(() => {});
  sendHeartbeat();
  let active = true;
  let unlistenReopenProbe: (() => void) | undefined;
  if (windowLabel === "main") {
    void listenToTauriEvent<RendererReopenProbePayload>(
      RENDERER_REOPEN_PROBE_EVENT,
      (event) => {
        void recordStartupCheckpoint({
          windowLabel,
          checkpoint: "renderer_reopen_ack",
          detail: `source=${event.payload.source ?? "unknown"}`,
        }).catch(() => {});
      },
    )
      .then((unlisten) => {
        if (active) {
          unlistenReopenProbe = unlisten;
        } else {
          unlisten();
        }
      })
      .catch(() => {});
  }
  const intervalId = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  window.addEventListener("error", errorListener);
  window.addEventListener("unhandledrejection", rejectionListener);

  return () => {
    active = false;
    unlistenReopenProbe?.();
    window.clearInterval(intervalId);
    window.removeEventListener("error", errorListener);
    window.removeEventListener("unhandledrejection", rejectionListener);
  };
}

export function rendererInstanceIdForCurrentLoad(): string {
  currentRendererInstanceId ??= createRendererInstanceId();
  return currentRendererInstanceId;
}

function createRendererInstanceId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  const values = new Uint32Array(4);
  cryptoApi?.getRandomValues?.(values);
  const fallback = Array.from(values)
    .map((value) => value.toString(16).padStart(8, "0"))
    .join("");

  return fallback || `renderer-${Date.now().toString(36)}`;
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
