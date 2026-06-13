type InvokeArgs = Record<string, unknown> | undefined;

type EventPayload<T> = {
  payload: T;
};

export function isTauriRuntime(): boolean {
  const globalScope = globalThis as typeof globalThis & {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };

  return Boolean(globalScope.__TAURI__ || globalScope.__TAURI_INTERNALS__);
}

export async function invokeTauri<T>(
  command: string,
  args?: InvokeArgs,
): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error(
      "Tauri runtime is not available. Install Rust and start the app with `npm run tauri dev`.",
    );
  }

  const { invoke } = await import("@tauri-apps/api/core");
  if (args === undefined) {
    return invoke<T>(command);
  }

  return invoke<T>(command, args);
}

export async function recordRendererHeartbeat(
  windowLabel: string,
  rendererInstanceId?: string,
): Promise<void> {
  return invokeTauri("record_renderer_heartbeat", {
    windowLabel,
    ...(rendererInstanceId === undefined ? {} : { rendererInstanceId }),
  });
}

export async function recordStartupCheckpoint(input: {
  windowLabel: string;
  checkpoint: string;
  detail?: string;
}): Promise<void> {
  const args =
    input.detail === undefined
      ? {
          windowLabel: input.windowLabel,
          checkpoint: input.checkpoint,
        }
      : input;

  return invokeTauri("record_startup_checkpoint", args);
}

export type VoiceCapsuleReadyChallenge = {
  runId: string;
  attemptId: string;
  nonce: string;
};

export async function getVoiceCapsuleReadyChallenge(
  rendererInstanceId: string,
): Promise<VoiceCapsuleReadyChallenge> {
  return invokeTauri("get_voice_capsule_ready_challenge", {
    rendererInstanceId,
  });
}

export async function recordVoiceCapsuleReady(input: {
  runId: string;
  attemptId: string;
  nonce: string;
  rendererInstanceId: string;
  sessionEnabled: boolean;
}): Promise<void> {
  return invokeTauri("record_voice_capsule_ready", input);
}

export async function recordRendererError(input: {
  windowLabel: string;
  message: string;
  source?: string;
  line?: number;
  column?: number;
}): Promise<void> {
  return invokeTauri("record_renderer_error", input);
}

export async function minimizeCurrentWindow(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().minimize();
}

export async function toggleMaximizeCurrentWindow(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().toggleMaximize();
}

export async function closeCurrentWindow(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().close();
}

export async function listenToTauriEvent<T>(
  event: string,
  handler: (event: EventPayload<T>) => void | Promise<void>,
): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => {};
  }

  const { listen } = await import("@tauri-apps/api/event");
  return listen<T>(event, handler);
}
