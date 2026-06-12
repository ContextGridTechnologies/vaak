import { expect, vi } from "vitest";

type InvokeArgs = Record<string, unknown> | undefined;
type CommandResolver = (args: InvokeArgs, callIndex: number) => unknown;

type TauriCommandCall = {
  command: string;
  args: InvokeArgs;
};

const invokeMock = vi.fn();
const listenMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

export type TauriCommandHarness = {
  calls: TauriCommandCall[];
  resolveCommand: (command: string, value: unknown) => void;
  rejectCommand: (command: string, error: unknown) => void;
};

export function createTauriCommandHarness(): TauriCommandHarness {
  const calls: TauriCommandCall[] = [];
  const resolved = new Map<string, unknown>();
  const rejected = new Map<string, unknown>();

  setTauriRuntimeAvailable();
  invokeMock.mockReset();
  listenMock.mockReset();
  listenMock.mockResolvedValue(() => {});
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
  };
}

export function expectTauriCommand(
  harness: TauriCommandHarness,
  command: string,
  args: InvokeArgs,
): void {
  expect(harness.calls).toContainEqual({ command, args });
}

export function setTauriRuntimeAvailable(): void {
  Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {
      invoke: (command: string, args?: InvokeArgs) => invokeMock(command, args),
    },
  });
}
