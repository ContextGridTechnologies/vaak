import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderApp } from "@/test/render";

import { CommandModePanel } from "./CommandModePanel";

const { respondToApproval, start, stop, useAssemblyAiVoiceAgent } = vi.hoisted(() => ({
  respondToApproval: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  useAssemblyAiVoiceAgent: vi.fn(),
}));

vi.mock("@/features/floating/useAssemblyAiVoiceAgent", () => ({
  useAssemblyAiVoiceAgent,
}));

describe("CommandModePanel", () => {
  beforeEach(() => {
    start.mockReset();
    start.mockResolvedValue(undefined);
    stop.mockReset();
    stop.mockResolvedValue(undefined);
    useAssemblyAiVoiceAgent.mockReset();
    useAssemblyAiVoiceAgent.mockReturnValue({
      isActive: false,
      message: "Voice agent ready.",
      pendingApproval: null,
      respondToApproval,
      start,
      state: "idle",
      stop,
    });
  });

  it("starts the shared voice agent from the main window", () => {
    renderApp(<CommandModePanel />);

    fireEvent.click(screen.getByRole("button", { name: "Start voice agent" }));

    expect(useAssemblyAiVoiceAgent).toHaveBeenCalledWith({ windowLabel: "main" });
    expect(start).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Voice agent ready.");
  });

  it("stops an active voice agent", () => {
    useAssemblyAiVoiceAgent.mockReturnValue({
      isActive: true,
      message: "Voice agent is listening.",
      pendingApproval: null,
      respondToApproval,
      start,
      state: "listening",
      stop,
    });
    renderApp(<CommandModePanel />);

    fireEvent.click(screen.getByRole("button", { name: "Stop voice agent" }));

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("shows and resolves a pending MCP approval", () => {
    useAssemblyAiVoiceAgent.mockReturnValue({
      isActive: true,
      message: "Voice agent needs approval.",
      pendingApproval: {
        approvalId: "approval_opaque",
        callId: "call-1",
        toolName: "windows_click",
        risk: "mutating",
        arguments: { ref: "button-4" },
      },
      respondToApproval,
      start,
      state: "approval",
      stop,
    });
    renderApp(<CommandModePanel />);

    expect(screen.getByText("windows_click needs approval")).toBeInTheDocument();
    expect(screen.getByText('{"ref":"button-4"}')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve once" }));

    expect(respondToApproval).toHaveBeenCalledWith(true);
  });
});
