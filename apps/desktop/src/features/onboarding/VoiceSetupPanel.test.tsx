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

  it("shows macOS accessibility guidance when focused app access is required", () => {
    renderApp(
      <VoiceSetupPanel
        accessibilityPermission={{
          granted: false,
          guidance:
            "Grant Accessibility access to Vaak in System Settings > Privacy & Security > Accessibility.",
          id: "accessibility",
          label: "Accessibility",
          required: true,
        }}
        hasMicrophonePermission
        tauriAvailable={true}
      />,
    );

    expect(screen.getByText("Accessibility")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Grant Accessibility access to Vaak in System Settings > Privacy & Security > Accessibility.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Needs access")).toHaveLength(1);
  });

  it("shows macOS input monitoring guidance when global shortcut access is required", () => {
    renderApp(
      <VoiceSetupPanel
        inputMonitoringPermission={{
          granted: false,
          guidance:
            "Grant Input Monitoring access to Vaak in System Settings > Privacy & Security > Input Monitoring.",
          id: "input_monitoring",
          label: "Input Monitoring",
          required: true,
        }}
        hasMicrophonePermission
        tauriAvailable={true}
      />,
    );

    expect(screen.getByText("Input Monitoring")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Grant Input Monitoring access to Vaak in System Settings > Privacy & Security > Input Monitoring.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Needs access")).toHaveLength(1);
  });

  it("hides input monitoring status when the platform does not require it", () => {
    renderApp(
      <VoiceSetupPanel
        inputMonitoringPermission={{
          granted: true,
          guidance:
            "Input Monitoring permission is not required on this platform.",
          id: "input_monitoring",
          label: "Input Monitoring",
          required: false,
        }}
        hasMicrophonePermission
        tauriAvailable={true}
      />,
    );

    expect(screen.queryByText("Input Monitoring")).not.toBeInTheDocument();
  });

  it("hides accessibility status when the platform does not require it", () => {
    renderApp(
      <VoiceSetupPanel
        accessibilityPermission={{
          granted: true,
          guidance: "Accessibility permission is not required on this platform.",
          id: "accessibility",
          label: "Accessibility",
          required: false,
        }}
        hasMicrophonePermission
        tauriAvailable={true}
      />,
    );

    expect(screen.queryByText("Accessibility")).not.toBeInTheDocument();
  });

  it("renders all configured provider setup cards", () => {
    renderApp(
      <VoiceSetupPanel hasMicrophonePermission tauriAvailable={true} />,
    );

    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Azure OpenAI")).toBeInTheDocument();
    expect(screen.queryByText("Azure AI Speech")).not.toBeInTheDocument();
    expect(screen.getByText("AssemblyAI")).toBeInTheDocument();
    expect(screen.getByText("ElevenLabs")).toBeInTheDocument();
    expect(screen.getByText("Smallest AI")).toBeInTheDocument();
    expect(screen.getByText("Deepgram")).toBeInTheDocument();
    expect(screen.getByText("Groq")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Configure" })).toHaveLength(7);
  });
});
