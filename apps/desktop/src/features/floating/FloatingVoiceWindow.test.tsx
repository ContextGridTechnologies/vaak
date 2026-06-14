import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTauriCommandHarness } from "@/test/tauri";
import { FloatingVoiceWindow } from "./FloatingVoiceWindow";

const {
  useDictationLoop,
  useDictationSession,
  getOnboardingState,
  moveFloatingWindow,
  getFloatingWindowStartState,
  getFloatingMonitorWorkArea,
  saveVoiceCapsulePlacement,
  setVoiceCapsuleSizeMode,
  insertIntoActiveTarget,
  openMainWindow,
  getVoiceCapsuleReadyChallenge,
  recordVoiceCapsuleReady,
  recordStartupCheckpoint,
} = vi.hoisted(() => ({
  useDictationLoop: vi.fn(),
  useDictationSession: vi.fn(),
  getOnboardingState: vi.fn(),
  moveFloatingWindow: vi.fn(),
  getFloatingWindowStartState: vi.fn(),
  getFloatingMonitorWorkArea: vi.fn(),
  saveVoiceCapsulePlacement: vi.fn(),
  setVoiceCapsuleSizeMode: vi.fn(),
  insertIntoActiveTarget: vi.fn(),
  openMainWindow: vi.fn(),
  getVoiceCapsuleReadyChallenge: vi.fn(),
  recordVoiceCapsuleReady: vi.fn(),
  recordStartupCheckpoint: vi.fn(),
}));

vi.mock("@/features/dictation/hooks/useDictationLoop", () => ({
  useDictationLoop,
}));

vi.mock("@/features/dictation/hooks/useDictationSession", () => ({
  useDictationSession,
}));

vi.mock("@/lib/tauri", () => ({
  getOnboardingState,
  isTauriRuntime: () => true,
  insertIntoActiveTarget,
  openMainWindow,
  getVoiceCapsuleReadyChallenge,
  listenToTauriEvent: vi.fn(async () => () => {}),
  recordStartupCheckpoint,
  recordVoiceCapsuleReady,
  saveVoiceCapsulePlacement,
  setVoiceCapsuleSizeMode,
  voiceCapsuleAnchors: [
    "bottomCenter",
    "bottomLeft",
    "bottomRight",
    "centerLeft",
    "centerRight",
    "topCenter",
  ],
}));

vi.mock("./window-controller", () => ({
  moveFloatingWindow,
  getFloatingWindowStartState,
  getFloatingMonitorWorkArea,
}));

describe("FloatingVoiceWindow", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    document.documentElement.removeAttribute("data-window");
    document.body.removeAttribute("data-window");
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    moveFloatingWindow.mockReset();
    setVoiceCapsuleSizeMode.mockReset();
    setVoiceCapsuleSizeMode.mockResolvedValue({ popupPlacement: "below" });
    insertIntoActiveTarget.mockReset();
    insertIntoActiveTarget.mockResolvedValue({
      characters: 5,
      method: "send_input",
    });
    openMainWindow.mockReset();
    openMainWindow.mockResolvedValue(undefined);
    getVoiceCapsuleReadyChallenge.mockReset();
    getVoiceCapsuleReadyChallenge.mockResolvedValue({
      runId: "run-1",
      attemptId: "attempt-1",
      nonce: "nonce-1",
    });
    recordVoiceCapsuleReady.mockReset();
    recordVoiceCapsuleReady.mockResolvedValue(undefined);
    recordStartupCheckpoint.mockReset();
    recordStartupCheckpoint.mockResolvedValue(undefined);
    saveVoiceCapsulePlacement.mockReset();
    saveVoiceCapsulePlacement.mockResolvedValue({});
    getFloatingWindowStartState.mockReset();
    getFloatingMonitorWorkArea.mockReset();
    getFloatingWindowStartState.mockResolvedValue({ x: 320, y: 640 });
    getFloatingMonitorWorkArea.mockResolvedValue({
      x: 0,
      y: 0,
      width: 1440,
      height: 860,
    });
    getOnboardingState.mockResolvedValue({
      completed: true,
      currentStep: "hotkeyReadiness",
      selectedMode: "local",
    });

    useDictationSession.mockReturnValue({
      audioBlob: null,
      audioUrl: null,
      focusedField: null,
      focusedFieldError: null,
      isRecording: false,
      recorderError: null,
      startManualDictation: vi.fn(),
      status: "idle",
      stopManualRecording: vi.fn(),
    });
    useDictationLoop.mockReturnValue({
      error: null,
      insertResult: null,
      message: "Recorder ready.",
      state: "idle",
      transcript: null,
    });
  });

  it("keeps the hidden capsule hotkey session disabled until onboarding is complete", async () => {
    getOnboardingState.mockResolvedValue({
      completed: false,
      currentStep: "modeChoice",
      selectedMode: null,
    });

    render(<FloatingVoiceWindow />);

    expect(useDictationSession).toHaveBeenCalledWith({ enabled: false });
  });

  it("records a typed voice capsule ready ack after onboarding is loaded", async () => {
    render(<FloatingVoiceWindow />);

    await waitFor(() => {
      expect(recordVoiceCapsuleReady).toHaveBeenCalledWith({
        runId: "run-1",
        attemptId: "attempt-1",
        nonce: "nonce-1",
        rendererInstanceId: expect.any(String),
        sessionEnabled: true,
      });
    });
  });

  it("records a sanitized ready ack failure and retries once for a stale challenge", async () => {
    getVoiceCapsuleReadyChallenge
      .mockResolvedValueOnce({
        runId: "run-1",
        attemptId: "attempt-old",
        nonce: "nonce-old",
      })
      .mockResolvedValueOnce({
        runId: "run-1",
        attemptId: "attempt-new",
        nonce: "nonce-new",
      });
    recordVoiceCapsuleReady
      .mockRejectedValueOnce(new Error("voice capsule ready ack rejected: stale_attempt"))
      .mockResolvedValueOnce(undefined);

    render(<FloatingVoiceWindow />);

    await waitFor(() => {
      expect(recordVoiceCapsuleReady).toHaveBeenCalledTimes(2);
    });
    expect(recordVoiceCapsuleReady).toHaveBeenLastCalledWith({
      runId: "run-1",
      attemptId: "attempt-new",
      nonce: "nonce-new",
      rendererInstanceId: expect.any(String),
      sessionEnabled: true,
    });
    expect(recordStartupCheckpoint).toHaveBeenCalledWith({
      windowLabel: "voice-capsule",
      checkpoint: "voice_capsule_ready_ack_send_failed",
      detail: "category=stale_challenge",
    });
  });

  it("renders a compact record button and starts recording when pressed", async () => {
    const user = userEvent.setup();
    const startManualDictation = vi.fn();

    useDictationSession.mockReturnValue({
      audioBlob: null,
      audioUrl: null,
      focusedField: null,
      focusedFieldError: null,
      isRecording: false,
      recorderError: null,
      startManualDictation,
      status: "idle",
      stopManualRecording: vi.fn(),
    });
    useDictationLoop.mockReturnValue({
      error: null,
      insertResult: null,
      message: "Recorder ready.",
      state: "idle",
      transcript: null,
    });

    render(<FloatingVoiceWindow />);

    const button = await screen.findByRole("button", {
      name: "Start recording",
    });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByLabelText("Recording wave")).not.toBeInTheDocument();

    await user.click(button);

    expect(startManualDictation).toHaveBeenCalledTimes(1);
  });

  it("uses a stronger capsule shell so the control stays legible on dark backgrounds", async () => {
    render(<FloatingVoiceWindow />);

    const button = await screen.findByRole("button", {
      name: "Start recording",
    });
    const main = button.closest("main");
    const capsule = button.closest("section");

    expect(main).toHaveClass("p-1.5");
    expect(capsule).toHaveClass(
      "border-white/15",
      "bg-neutral-950/92",
      "shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
    );
    expect(capsule).not.toHaveClass("backdrop-blur-xl");
    expect(button).toHaveClass(
      "border-white/14",
      "bg-white/14",
      "shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]",
    );
  });

  it("does not opt into Tauri native dragging while custom snap dragging is active", async () => {
    render(<FloatingVoiceWindow />);

    const button = await screen.findByRole("button", {
      name: "Start recording",
    });
    const capsule = button.closest("section");

    expect(capsule).not.toHaveAttribute("data-tauri-drag-region");
  });

  it("shows an animated wave and stops recording when pressed again", async () => {
    const user = userEvent.setup();
    const stopManualRecording = vi.fn();

    useDictationSession.mockReturnValue({
      audioBlob: null,
      audioUrl: null,
      focusedField: null,
      focusedFieldError: null,
      isRecording: true,
      recorderError: null,
      startManualDictation: vi.fn(),
      status: "recording",
      stopManualRecording,
    });
    useDictationLoop.mockReturnValue({
      error: null,
      insertResult: null,
      message: "Recording in progress.",
      state: "recording",
      transcript: null,
    });

    render(<FloatingVoiceWindow />);

    const button = await screen.findByRole("button", {
      name: "Stop recording",
    });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Recording wave")).toBeInTheDocument();

    await user.click(button);

    expect(stopManualRecording).toHaveBeenCalledTimes(1);
  });

  it("shows transcription and insertion progress without allowing another start", async () => {
    const user = userEvent.setup();
    const startManualDictation = vi.fn();

    useDictationSession.mockReturnValue({
      audioBlob: new Blob([new Uint8Array([1])], { type: "audio/webm" }),
      audioUrl: null,
      focusedField: null,
      focusedFieldError: null,
      isRecording: false,
      recorderError: null,
      startManualDictation,
      status: "stopped",
      stopManualRecording: vi.fn(),
    });
    useDictationLoop.mockReturnValue({
      error: null,
      insertResult: null,
      message: "Sending audio to OpenAI",
      state: "transcribing",
      transcript: null,
    });

    render(<FloatingVoiceWindow />);

    const button = await screen.findByRole("button", {
      name: "Dictation busy",
    });
    expect(button).toBeDisabled();
    expect(screen.getByLabelText("Transcribing audio")).toBeInTheDocument();
    expect(screen.getByText("Sending audio to OpenAI")).toBeInTheDocument();

    await user.click(button);

    expect(startManualDictation).not.toHaveBeenCalled();
  });

  it("shows successful insertion as a ready start control", async () => {
    useDictationLoop.mockReturnValue({
      error: null,
      insertResult: { characters: 5, method: "send_input" },
      message: "Inserted transcript.",
      state: "inserted",
      transcript: "hello",
    });

    render(<FloatingVoiceWindow />);

    expect(
      await screen.findByRole("button", { name: "Start recording" }),
    ).toBeEnabled();
    expect(screen.getByText("Inserted transcript.")).toBeInTheDocument();
  });

  it("exposes dictation errors as accessible status text", async () => {
    useDictationLoop.mockReturnValue({
      error: { kind: "insertion", message: "Insertion failed: target changed" },
      insertResult: null,
      message: "Insertion failed: target changed",
      state: "error",
      transcript: "hello",
    });

    render(<FloatingVoiceWindow />);

    expect(
      await screen.findByText("Insertion failed: target changed"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start recording" }),
    ).toBeEnabled();
  });

  it("shows insertion recovery actions and auto-restores the compact capsule after the timeout", async () => {
    vi.useFakeTimers();

    useDictationLoop.mockReturnValue({
      error: { kind: "insertion", message: "Insertion failed: target changed" },
      insertResult: null,
      message: "Insertion failed: target changed",
      state: "error",
      transcript: "hello from voice",
    });

    render(<FloatingVoiceWindow />);

    expect(screen.getByText("Transcript ready")).toBeInTheDocument();
    expect(screen.queryByText("Could not insert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy transcript" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Retry insertion" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Voice" })).toBeEnabled();

    await Promise.resolve();
    expect(setVoiceCapsuleSizeMode).toHaveBeenCalledWith(
      "insertionRecoveryOpen",
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(screen.queryByText("Transcript ready")).not.toBeInTheDocument();
    expect(setVoiceCapsuleSizeMode).toHaveBeenLastCalledWith("compact");

    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
    expect(insertIntoActiveTarget).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("uses pointer cursors for the clickable recovery surface and actions", async () => {
    useDictationLoop.mockReturnValue({
      error: { kind: "insertion", message: "Insertion failed" },
      insertResult: null,
      message: "Insertion failed",
      state: "error",
      transcript: "clickable text",
    });

    render(<FloatingVoiceWindow />);

    const copyButton = screen.getByRole("button", { name: "Copy transcript" });
    const openVoiceButton = screen.getByRole("button", { name: "Open Voice" });
    const capsule = screen.getByRole("button", { name: "Start recording" }).closest("section");

    expect(capsule).toHaveClass("cursor-pointer");
    expect(copyButton).toHaveClass("cursor-pointer");
    expect(openVoiceButton).toHaveClass("cursor-pointer");
  });

  it("renders the recovery tray with app theme tokens and shadcn-style controls", async () => {
    useDictationLoop.mockReturnValue({
      error: { kind: "insertion", message: "Insertion failed" },
      insertResult: null,
      message: "Insertion failed",
      state: "error",
      transcript: "theme aligned text",
    });

    render(<FloatingVoiceWindow />);

    const tray = screen.getByRole("dialog", { name: "Transcript ready" });
    const copyButton = screen.getByRole("button", { name: "Copy transcript" });
    const openVoiceButton = screen.getByRole("button", { name: "Open Voice" });

    expect(tray).toHaveClass(
      "bg-popover",
      "text-popover-foreground",
      "ring-border/80",
    );
    expect(tray).not.toHaveClass("bg-neutral-950/96", "text-white");
    expect(screen.getByText("Auto-closes").closest("[data-slot='badge']")).toHaveClass(
      "bg-secondary",
      "text-secondary-foreground",
    );
    expect(copyButton).toHaveAttribute("data-slot", "button");
    expect(copyButton).toHaveAttribute("data-variant", "default");
    expect(screen.queryByRole("button", { name: "Retry insertion" })).not.toBeInTheDocument();
    expect(openVoiceButton).toHaveAttribute("data-variant", "ghost");
  });

  it("keeps the bottom capsule compact while the recovery tray is open", async () => {
    useDictationLoop.mockReturnValue({
      error: { kind: "insertion", message: "Insertion failed" },
      insertResult: null,
      message: "Insertion failed",
      state: "error",
      transcript: "compact capsule",
    });

    render(<FloatingVoiceWindow />);

    const capsule = screen.getByRole("button", { name: "Start recording" }).closest("section");

    expect(screen.getByRole("dialog", { name: "Transcript ready" })).toBeInTheDocument();
    expect(capsule).toHaveClass("h-6", "w-11", "shrink-0");
    expect(capsule).not.toHaveClass("h-full", "w-full", "w-[12.75rem]");
  });

  it("renders the recovery tray above the capsule when the resize command chooses above placement", async () => {
    vi.useFakeTimers();
    setVoiceCapsuleSizeMode.mockImplementation(async (mode: string) => ({
      popupPlacement: mode === "insertionRecoveryOpen" ? "above" : "below",
    }));

    useDictationLoop.mockReturnValue({
      error: { kind: "insertion", message: "Insertion failed" },
      insertResult: null,
      message: "Insertion failed",
      state: "error",
      transcript: "bottom edge text",
    });

    render(<FloatingVoiceWindow />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("dialog", { name: "Transcript ready" })).toHaveAttribute(
      "data-side",
      "above",
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(setVoiceCapsuleSizeMode).toHaveBeenLastCalledWith(
      "compactFromRecoveryAbove",
    );
  });

  it("right-aligns the compact capsule when the clamped recovery window opens from the right edge", async () => {
    vi.useFakeTimers();
    setVoiceCapsuleSizeMode.mockImplementation(async (mode: string) => ({
      popupPlacement: mode === "insertionRecoveryOpen" ? "above" : "below",
      popupHorizontalPlacement:
        mode === "insertionRecoveryOpen" ? "right" : "left",
    }));

    useDictationLoop.mockReturnValue({
      error: { kind: "insertion", message: "Insertion failed" },
      insertResult: null,
      message: "Insertion failed",
      state: "error",
      transcript: "right edge text",
    });

    render(<FloatingVoiceWindow />);

    await act(async () => {
      await Promise.resolve();
    });

    const capsule = screen.getByRole("button", { name: "Start recording" }).closest("section");
    const main = capsule?.closest("main");

    expect(main).toHaveClass("items-end");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(setVoiceCapsuleSizeMode).toHaveBeenLastCalledWith(
      "compactFromRecoveryAboveRight",
    );
  });

  it("keeps recovery usable when resizing the native popup window fails", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    setVoiceCapsuleSizeMode.mockRejectedValueOnce(new Error("resize failed"));

    useDictationLoop.mockReturnValue({
      error: { kind: "insertion", message: "Insertion failed" },
      insertResult: null,
      message: "Insertion failed",
      state: "error",
      transcript: "still copyable",
    });

    render(<FloatingVoiceWindow />);

    expect(
      await screen.findByText("Could not resize recovery popup."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy transcript" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("still copyable");
    });
  });

  it("copies the failed insertion transcript before the recovery popup closes", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    useDictationLoop.mockReturnValue({
      error: { kind: "insertion", message: "Insertion failed" },
      insertResult: null,
      message: "Insertion failed",
      state: "error",
      transcript: "copy me",
    });

    render(<FloatingVoiceWindow />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy transcript" }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith("copy me");
    expect(screen.getByText("Copied")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });

    await Promise.resolve();
    expect(setVoiceCapsuleSizeMode).toHaveBeenLastCalledWith("compact");

    vi.useRealTimers();
  });

  it("does not show retry insertion in the recovery popup", async () => {
    useDictationLoop.mockReturnValue({
      error: { kind: "insertion", message: "Insertion failed" },
      insertResult: null,
      message: "Insertion failed",
      state: "error",
      transcript: "copy instead",
    });

    render(<FloatingVoiceWindow />);

    expect(screen.getByText("Transcript ready")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry insertion" })).not.toBeInTheDocument();
    expect(insertIntoActiveTarget).not.toHaveBeenCalled();
  });

  it("opens the main Voice window from the recovery popup", async () => {
    const user = userEvent.setup();

    useDictationLoop.mockReturnValue({
      error: { kind: "insertion", message: "Insertion failed" },
      insertResult: null,
      message: "Insertion failed",
      state: "error",
      transcript: "open me",
    });

    render(<FloatingVoiceWindow />);

    await user.click(screen.getByRole("button", { name: "Open Voice" }));

    expect(openMainWindow).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(setVoiceCapsuleSizeMode).toHaveBeenLastCalledWith("compact");
    });
  });

  it("does not toggle recording when the press turns into a drag gesture", async () => {
    const startManualDictation = vi.fn();
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("save_voice_capsule_placement", {
      anchor: "bottomRight",
      offsetX: 992,
      offsetY: 112,
    });

    useDictationSession.mockReturnValue({
      audioBlob: null,
      audioUrl: null,
      focusedField: null,
      focusedFieldError: null,
      isRecording: false,
      recorderError: null,
      startManualDictation,
      status: "idle",
      stopManualRecording: vi.fn(),
    });

    render(<FloatingVoiceWindow />);

    const button = await screen.findByRole("button", {
      name: "Start recording",
    });

    button.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 340,
        clientY: 680,
        screenX: 340,
        screenY: 680,
        pointerId: 1,
      }),
    );
    button.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        button: 0,
        clientX: 392,
        clientY: 712,
        screenX: 392,
        screenY: 712,
        pointerId: 1,
      }),
    );
    button.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        button: 0,
        clientX: 392,
        clientY: 712,
        screenX: 392,
        screenY: 712,
        pointerId: 1,
      }),
    );
    button.click();

    expect(startManualDictation).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(moveFloatingWindow).toHaveBeenCalled();
    });
  });

  it("uses screen coordinates so moving the window does not feed back into drag deltas", async () => {
    render(<FloatingVoiceWindow />);

    const button = await screen.findByRole("button", {
      name: "Start recording",
    });

    button.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 10,
        clientY: 10,
        screenX: 340,
        screenY: 680,
        pointerId: 1,
      }),
    );
    button.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        button: 0,
        clientX: 10,
        clientY: 10,
        screenX: 392,
        screenY: 712,
        pointerId: 1,
      }),
    );

    await waitFor(() => {
      expect(moveFloatingWindow).toHaveBeenCalledWith({
        x: 372,
        y: 672,
      });
    });
  });

  it("stops dragging on pointer cancel", async () => {
    render(<FloatingVoiceWindow />);

    const button = await screen.findByRole("button", {
      name: "Start recording",
    });

    button.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        screenX: 340,
        screenY: 680,
        pointerId: 1,
      }),
    );
    button.dispatchEvent(
      new PointerEvent("pointercancel", {
        bubbles: true,
        pointerId: 1,
      }),
    );
    button.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        button: 0,
        screenX: 392,
        screenY: 712,
        pointerId: 1,
      }),
    );

    await Promise.resolve();

    expect(moveFloatingWindow).not.toHaveBeenCalled();
  });

  it("ignores stale move callbacks after the pointer is released", async () => {
    let resolveStartState: (position: { x: number; y: number }) => void;
    getFloatingWindowStartState.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStartState = resolve;
      }),
    );

    render(<FloatingVoiceWindow />);

    const button = await screen.findByRole("button", {
      name: "Start recording",
    });

    button.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        screenX: 340,
        screenY: 680,
        pointerId: 1,
      }),
    );
    button.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        button: 0,
        screenX: 392,
        screenY: 712,
        pointerId: 1,
      }),
    );
    button.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        button: 0,
        screenX: 704,
        screenY: 28,
        pointerId: 1,
      }),
    );

    resolveStartState!({ x: 320, y: 640 });

    await waitFor(() => {
      expect(saveVoiceCapsulePlacement).toHaveBeenCalled();
    });
    expect(moveFloatingWindow).not.toHaveBeenCalledWith({
      x: 372,
      y: 672,
    });
  });

  it("persists a top-center snap when dropped near the top center", async () => {
    render(<FloatingVoiceWindow />);

    const button = await screen.findByRole("button", {
      name: "Start recording",
    });

    button.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 320,
        clientY: 640,
        screenX: 320,
        screenY: 640,
        pointerId: 1,
      }),
    );
    button.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        button: 0,
        clientX: 704,
        clientY: 28,
        screenX: 704,
        screenY: 28,
        pointerId: 1,
      }),
    );
    button.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        button: 0,
        clientX: 704,
        clientY: 28,
        screenX: 704,
        screenY: 28,
        pointerId: 1,
      }),
    );

    await waitFor(() => {
      expect(saveVoiceCapsulePlacement).toHaveBeenCalledWith({
        anchor: "topCenter",
        offsetX: 12,
        offsetY: 28,
      });
    });
  });
});
