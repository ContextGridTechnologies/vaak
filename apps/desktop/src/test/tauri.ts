import { expect, vi } from "vitest";

type InvokeArgs = Record<string, unknown> | undefined;

type TauriCommandCall = {
  command: string;
  args: InvokeArgs;
};

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
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
  invokeMock.mockImplementation((command: string, args?: InvokeArgs) => {
    calls.push({ command, args });

    if (rejected.has(command)) {
      return Promise.reject(rejected.get(command));
    }
    if (resolved.has(command)) {
      return Promise.resolve(resolved.get(command));
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
    value: {},
  });
}
