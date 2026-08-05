import { expect, vi } from "vitest";

type InvokeArgs = Record<string, unknown> | undefined;
type CommandResolver = (args: InvokeArgs, callIndex: number) => unknown;

type TauriCommandCall = {
  command: string;
  args: InvokeArgs;
};
type TauriEventHandler = (event: { payload: unknown }) => void | Promise<void>;

const invokeMock = vi.fn();
const listenMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  Channel: class MockChannel<T> {
    onmessage: ((message: T) => void) | null = null;
  },
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

export type TauriCommandHarness = {
  calls: TauriCommandCall[];
  resolveCommand: (command: string, value: unknown) => void;
  rejectCommand: (command: string, error: unknown) => void;
  emitEvent: (event: string, payload?: unknown) => Promise<void>;
  listenerCount: (event: string) => number;
};

export function createTauriCommandHarness(): TauriCommandHarness {
  const calls: TauriCommandCall[] = [];
  const resolved = new Map<string, unknown>();
  const rejected = new Map<string, unknown>();
  const eventListeners = new Map<string, Set<TauriEventHandler>>();

  setTauriRuntimeAvailable();
  resolved.set("get_transcription_prompt_support", true);
  invokeMock.mockReset();
  listenMock.mockReset();
  listenMock.mockImplementation(
    (event: string, handler: TauriEventHandler) => {
      const listeners = eventListeners.get(event) ?? new Set<TauriEventHandler>();
      listeners.add(handler);
      eventListeners.set(event, listeners);
      return Promise.resolve(() => {
        listeners.delete(handler);
      });
    },
  );
  invokeMock.mockImplementation((command: string, args?: InvokeArgs) => {
    calls.push({ command, args });

    if (rejected.has(command)) {
      return Promise.reject(rejected.get(command));
    }
    if (resolved.has(command)) {
      const value = resolved.get(command);
      return Promise.resolve(
        typeof value === "function"
          ? (value as CommandResolver)(args, calls.length - 1)
          : value,
      );
    }

    return Promise.reject(new Error(`Unhandled Tauri command: ${command}`));
  });

  return {
    calls,
    resolveCommand(command, value) {
      resolved.set(command, value);
    },
    rejectCommand(command, error) {
      rejected.set(command, error);
    },
    async emitEvent(event, payload) {
      const listeners = [...(eventListeners.get(event) ?? [])];
      await Promise.all(listeners.map((listener) => listener({ payload })));
    },
    listenerCount(event) {
      return eventListeners.get(event)?.size ?? 0;
    },
  };
}

export function expectTauriCommand(
  harness: TauriCommandHarness,
  command: string,
  args: InvokeArgs,
): void {
  expect(
    harness.calls.map((call) => ({
      command: call.command,
      args: normalizeInvokeArgs(call.args),
    })),
  ).toContainEqual({ command, args: normalizeInvokeArgs(args) });
}

function normalizeInvokeArgs(args: InvokeArgs): InvokeArgs {
  if (args && Object.keys(args).length === 0) {
    return undefined;
  }

  return args;
}

export function setTauriRuntimeAvailable(): void {
  Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {
      invoke: (command: string, args?: InvokeArgs) => invokeMock(command, args),
    },
  });
}
