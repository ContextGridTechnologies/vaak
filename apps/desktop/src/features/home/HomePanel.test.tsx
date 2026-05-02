import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderApp } from "@/test/render";

import { HomePanel } from "./HomePanel";

const {
  getRecentDictationRecords,
  isTauriRuntime,
  sanitizeTargetControlName,
} = vi.hoisted(() => ({
  getRecentDictationRecords: vi.fn(),
  isTauriRuntime: vi.fn(),
  sanitizeTargetControlName: vi.fn(),
}));

vi.mock("@/lib/tauri", () => ({
  getRecentDictationRecords,
  isTauriRuntime,
  sanitizeTargetControlName,
}));

describe("HomePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTauriRuntime.mockReturnValue(true);
    sanitizeTargetControlName.mockImplementation(({ controlName, controlType }) =>
      controlName || controlType,
    );
  });

  it("renders a production activity overview with summary cards and feed rows", async () => {
    getRecentDictationRecords.mockResolvedValue([
      {
        schemaVersion: 1,
        recordId: "7f3e2c91-5b6a-4a23-9f8e-1b7d2a9c3e41",
        userId: "b4c8d2f0-2a71-4c8a-9bde-3f1a7e9b8c6d",
        installationId: "c2e9af6b-8d31-4e33-9d24-0f6e7c3b6a11",
        deviceId: "d1f6b2e9-3c47-4a1f-a2d1-9a3c6f7b8e22",
        sessionId: "e7d9a3c1-1f6b-4b2a-b8e9-6c3a5d7f9b44",
        mode: "dictation",
        trigger: "hotkey",
        platform: "windows",
        capturedAt: "2025-05-19T10:24:31Z",
        startedAt: null,
        endedAt: null,
        target: {
          stableId: "discord:messagebox:chat-input",
          windowTitle: "#product-launch - Discord",
          controlName: "Message Box",
          controlType: "Edit",
          controlTypeId: 50004,
          automationId: "chat-input",
          frameworkId: "WebView2",
          className: "Chrome_WidgetWin_1",
          nativeWindowHandle: 42,
          inputKind: "text",
          currentValue: null,
        },
        provider: {
          providerId: "openai",
          modelId: "gpt-4o-mini-transcribe",
        },
        transcript: {
          rawText: "Hey team, just a quick update on the launch plan",
          finalText: "Hey team, just a quick update on the launch plan",
          characterCount: 44,
        },
        insertion: {
          status: "inserted",
          method: "send_input",
          errorCode: null,
          errorMessage: null,
        },
      },
    ]);

    renderApp(<HomePanel />);

    await waitFor(() => {
      expect(
        screen.getByText("Local history · 1 recent record"),
      ).toBeInTheDocument();
    });

    expect(getRecentDictationRecords).toHaveBeenCalledWith(12);
    expect(screen.getByText("Activity overview")).toBeInTheDocument();
    expect(screen.getByText("Recent records")).toBeInTheDocument();
    expect(screen.getByText("Successful inserts")).toBeInTheDocument();
    expect(screen.getByText("Primary target")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "View full history" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Discord").length).toBeGreaterThan(0);
    expect(screen.getByText("Message Box")).toBeInTheDocument();
    expect(screen.getAllByText("Inserted").length).toBeGreaterThan(0);
    expect(screen.queryByText("Capture record")).not.toBeInTheDocument();
    expect(screen.queryByText("Versioned record")).not.toBeInTheDocument();
  });

  it("shows a polished empty state when there is no persisted dictation history yet", async () => {
    getRecentDictationRecords.mockResolvedValue([]);

    renderApp(<HomePanel />);

    await waitFor(() => {
      expect(
        screen.getByText("Local history · 0 recent records"),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText("Recent activity will appear here"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Start dictation once and Vaak will keep a local-first trail of recent insertions, skips, and failures.",
      ),
    ).toBeInTheDocument();
  });

  it("replaces editor accessibility placeholder text with a clean target label", async () => {
    sanitizeTargetControlName.mockImplementation(({ controlName, controlType }) =>
      /The editor is not accessible at this time/i.test(controlName)
        ? "Editor"
        : controlName || controlType,
    );
    getRecentDictationRecords.mockResolvedValue([
      {
        schemaVersion: 1,
        recordId: "e9b5f6ca-81e6-4405-b0d1-5bcf1ca92552",
        userId: "b4c8d2f0-2a71-4c8a-9bde-3f1a7e9b8c6d",
        installationId: "c2e9af6b-8d31-4e33-9d24-0f6e7c3b6a11",
        deviceId: "d1f6b2e9-3c47-4a1f-a2d1-9a3c6f7b8e22",
        sessionId: "e7d9a3c1-1f6b-4b2a-b8e9-6c3a5d7f9b44",
        mode: "dictation",
        trigger: "hotkey",
        platform: "windows",
        capturedAt: "2025-05-19T10:24:31Z",
        startedAt: null,
        endedAt: null,
        target: {
          stableId: "vscode:editor:active",
          windowTitle: "Visual Studio Code",
          controlName:
            "The editor is not accessible at this time. To enable screen reader optimized mode, use Shift+Alt+F1",
          controlType: "Document",
          controlTypeId: 50030,
          automationId: "editor",
          frameworkId: "Chrome",
          className: "Chrome_RenderWidgetHostHWND",
          nativeWindowHandle: 42,
          inputKind: "editor",
          currentValue: null,
        },
        provider: {
          providerId: "openai",
          modelId: "gpt-4o-mini-transcribe",
        },
        transcript: {
          rawText: "Refactor the focus capture flow",
          finalText: "Refactor the focus capture flow",
          characterCount: 31,
        },
        insertion: {
          status: "inserted",
          method: "send_input",
          errorCode: null,
          errorMessage: null,
        },
      },
    ]);

    renderApp(<HomePanel />);

    await waitFor(() => {
      expect(screen.getAllByText("Visual Studio Code").length).toBeGreaterThan(
        0,
      );
    });

    expect(screen.getAllByText("Editor").length).toBeGreaterThan(0);
    expect(sanitizeTargetControlName).toHaveBeenCalled();
    expect(
      screen.queryAllByText(/The editor is not accessible at this time/i),
    ).toHaveLength(0);
  });
});
