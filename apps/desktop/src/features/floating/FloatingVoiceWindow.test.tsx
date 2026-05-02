import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FloatingVoiceWindow } from "./FloatingVoiceWindow";

const {
  useDictationLoop,
  useDictationSession,
} = vi.hoisted(() => ({
  useDictationLoop: vi.fn(),
  useDictationSession: vi.fn(),
}));

vi.mock("@/features/dictation/hooks/useDictationLoop", () => ({
  useDictationLoop,
}));

vi.mock("@/features/dictation/hooks/useDictationSession", () => ({
  useDictationSession,
}));

describe("FloatingVoiceWindow", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-window");
    document.body.removeAttribute("data-window");

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
});
