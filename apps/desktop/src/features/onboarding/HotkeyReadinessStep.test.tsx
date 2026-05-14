import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderApp } from "@/test/render";

import { HotkeyReadinessStep } from "./HotkeyReadinessStep";

const dictationSessionState = vi.hoisted(() => ({
  useDictationSession: vi.fn(),
  hookValue: {
    activeMode: "idle",
    hasPermission: true,
    hotkeyBindings: {
      dictation: "Ctrl+Win",
      command: "Ctrl+Win+Alt",
    },
    isWindows: true,
    isRecording: false,
    requestPermission: vi.fn(),
    reset: vi.fn(),
    status: "idle",
    statusLabel: "Idle",
    tauriAvailable: true,
  },
}));

const tauriState = vi.hoisted(() => ({
  saveDictationHotkey: vi.fn(),
}));

vi.mock("@/features/dictation/hooks/useDictationSession", () => ({
  useDictationSession: dictationSessionState.useDictationSession,
}));

vi.mock("@/lib/tauri", () => ({
  saveDictationHotkey: tauriState.saveDictationHotkey,
}));

describe("HotkeyReadinessStep", () => {
  beforeEach(() => {
    dictationSessionState.hookValue = {
      activeMode: "idle",
      hasPermission: true,
      hotkeyBindings: {
        dictation: "Ctrl+Win",
        command: "Ctrl+Win+Alt",
      },
      isWindows: true,
      isRecording: false,
      requestPermission: vi.fn(),
      reset: vi.fn(),
      status: "idle",
      statusLabel: "Idle",
      tauriAvailable: true,
    };
    dictationSessionState.useDictationSession.mockReset();
    dictationSessionState.useDictationSession.mockImplementation(
      () => dictationSessionState.hookValue,
    );
    tauriState.saveDictationHotkey.mockReset();
  });

  it("uses verification-only recording so shortcut test audio is never inserted", async () => {
    renderApp(
      <HotkeyReadinessStep
        error={null}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    expect(dictationSessionState.useDictationSession).toHaveBeenCalledWith({
      processingEnabled: false,
    });
  });

  it("shows the default guided test state before the shortcut succeeds", async () => {
    renderApp(
      <HotkeyReadinessStep
        error={null}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("heading", {
        name: "Set your hold-to-talk shortcut",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ctrl")).toBeInTheDocument();
    expect(screen.getByText("Win")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Test with Ctrl + Win" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Change shortcut" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue" }),
    ).not.toBeInTheDocument();
  });

  it("moves into the guided hold instruction when the user starts the test", async () => {
    const user = userEvent.setup();

    renderApp(
      <HotkeyReadinessStep
        error={null}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: "Test with Ctrl + Win" }),
    );

    expect(
      screen.getByRole("heading", { name: "Now hold Ctrl + Win and speak" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue" }),
    ).not.toBeInTheDocument();
  });

  it("reveals Continue only after a real dictation hold cycle succeeds", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();

    const view = renderApp(
      <HotkeyReadinessStep
        error={null}
        onBack={vi.fn()}
        onContinue={onContinue}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: "Test with Ctrl + Win" }),
    );

    dictationSessionState.hookValue = {
      ...dictationSessionState.hookValue,
      activeMode: "dictation",
      isRecording: true,
      status: "recording",
      statusLabel: "Recording",
    };

    view.rerender(
      <HotkeyReadinessStep
        error={null}
        onBack={vi.fn()}
        onContinue={onContinue}
      />,
    );

    dictationSessionState.hookValue = {
      ...dictationSessionState.hookValue,
      activeMode: "idle",
      isRecording: false,
      status: "stopped",
      statusLabel: "Captured",
    };

    view.rerender(
      <HotkeyReadinessStep
        error={null}
        onBack={vi.fn()}
        onContinue={onContinue}
      />,
    );

    expect(
      await screen.findByRole("button", { name: "Continue" }),
    ).toBeEnabled();
    expect(
      screen.getByText("Shortcut test passed"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("updates the CTA after saving a new shortcut and clears prior success", async () => {
    const user = userEvent.setup();
    tauriState.saveDictationHotkey.mockResolvedValue({
      dictation: "Ctrl+Shift",
      command: "Ctrl+Shift+Alt",
    });

    const view = renderApp(
      <HotkeyReadinessStep
        error={null}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: "Test with Ctrl + Win" }),
    );

    dictationSessionState.hookValue = {
      ...dictationSessionState.hookValue,
      activeMode: "dictation",
      isRecording: true,
      status: "recording",
      statusLabel: "Recording",
    };

    view.rerender(
      <HotkeyReadinessStep
        error={null}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    dictationSessionState.hookValue = {
      ...dictationSessionState.hookValue,
      activeMode: "idle",
      isRecording: false,
      status: "stopped",
      statusLabel: "Captured",
    };

    view.rerender(
      <HotkeyReadinessStep
        error={null}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("button", { name: "Continue" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change shortcut" }));
    await user.keyboard("{Control>}{Shift>}{/Shift}{/Control}");
    await user.click(screen.getByRole("button", { name: "Save shortcut" }));

    expect(tauriState.saveDictationHotkey).toHaveBeenCalledWith("Ctrl+Shift");
    expect(
      await screen.findByRole("button", { name: "Test with Ctrl + Shift" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue" }),
    ).not.toBeInTheDocument();
  });
});
