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
  return invoke<T>(command, args);
}

export async function minimizeCurrentWindow(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().minimize();
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
