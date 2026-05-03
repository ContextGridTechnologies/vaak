import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderApp } from "@/test/render";

import { VoiceSetupPanel } from "./VoiceSetupPanel";

describe("VoiceSetupPanel", () => {
  it("shows ready desktop and microphone setup states when local app capabilities are available", () => {
    renderApp(
      <VoiceSetupPanel hasMicrophonePermission tauriAvailable={true} />,
    );

    expect(screen.getByText("Configure your voice layer")).toBeInTheDocument();
    expect(screen.getByText("Audio capture permission is available.")).toBeInTheDocument();
    expect(screen.getByText("Desktop insertion capabilities are available.")).toBeInTheDocument();
    expect(screen.getByText("Local mode active")).toBeInTheDocument();
  });

  it("shows blocked setup states when running outside the full desktop runtime", () => {
    renderApp(
      <VoiceSetupPanel
        hasMicrophonePermission={false}
        tauriAvailable={false}
      />,
    );

    expect(
      screen.getByText("Grant microphone access to capture dictation audio."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Run the Tauri app to insert text into other desktop apps."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Needs access")).toHaveLength(1);
    expect(screen.getAllByText("Desktop required")).toHaveLength(1);
  });

  it("renders all configured provider setup cards", () => {
    renderApp(
      <VoiceSetupPanel hasMicrophonePermission tauriAvailable={true} />,
    );

    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Azure OpenAI")).toBeInTheDocument();
    expect(screen.getByText("AssemblyAI")).toBeInTheDocument();
    expect(screen.getByText("ElevenLabs")).toBeInTheDocument();
    expect(screen.getByText("Smallest AI")).toBeInTheDocument();
    expect(screen.getByText("Deepgram")).toBeInTheDocument();
    expect(screen.getByText("Groq")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Configure" })).toHaveLength(7);
  });
});
