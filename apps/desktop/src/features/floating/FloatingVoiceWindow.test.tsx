import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FloatingVoiceWindow } from "./FloatingVoiceWindow";

const {
  useDictationSession,
  getSelectedSpeechProvider,
  listenToTauriEvent,
  transcribeRecording,
} = vi.hoisted(() => ({
  useDictationSession: vi.fn(),
  getSelectedSpeechProvider: vi.fn(),
  listenToTauriEvent: vi.fn(),
  transcribeRecording: vi.fn(),
}));

vi.mock("@/features/dictation/hooks/useDictationSession", () => ({
  useDictationSession,
}));

vi.mock("@/lib/tauri", () => ({
  SPEECH_PROVIDER_CHANGED_EVENT: "vaak://speech-provider-changed",
  getSelectedSpeechProvider,
  listenToTauriEvent,
  transcribeRecording,
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
    getSelectedSpeechProvider.mockResolvedValue("openai");
    listenToTauriEvent.mockResolvedValue(() => {});
    transcribeRecording.mockResolvedValue({
      durationMs: 0,
      model: "gpt-4o-mini-transcribe",
      providerId: "openai",
      text: "hello",
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

    render(<FloatingVoiceWindow />);

    const button = await screen.findByRole("button", {
      name: "Start recording",
    });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByLabelText("Recording wave")).not.toBeInTheDocument();

    await user.click(button);

    expect(startManualDictation).toHaveBeenCalledTimes(1);
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

    render(<FloatingVoiceWindow />);

    const button = await screen.findByRole("button", {
      name: "Stop recording",
    });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Recording wave")).toBeInTheDocument();

    await user.click(button);

    expect(stopManualRecording).toHaveBeenCalledTimes(1);
  });
});
