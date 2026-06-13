import { fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderApp } from "@/test/render";

import { RendererErrorBoundary } from "./RendererErrorBoundary";

const recordRendererError = vi.fn();
const recordStartupCheckpoint = vi.fn();

vi.mock("@/lib/tauri", () => ({
  isTauriRuntime: () => true,
  recordRendererError: (...args: unknown[]) => recordRendererError(...args),
  recordStartupCheckpoint: (...args: unknown[]) =>
    recordStartupCheckpoint(...args),
}));

function BrokenChild(): ReactNode {
  throw new Error("startup render failed");
}

describe("RendererErrorBoundary", () => {
  beforeEach(() => {
    recordRendererError.mockReset();
    recordRendererError.mockResolvedValue(undefined);
    recordStartupCheckpoint.mockReset();
    recordStartupCheckpoint.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a main-window recovery state after startup render errors", () => {
    renderApp(
      <RendererErrorBoundary windowLabel="main" reloadWindow={vi.fn()}>
        <BrokenChild />
      </RendererErrorBoundary>,
    );

    expect(screen.getByText("Vaak")).toBeInTheDocument();
    expect(
      screen.getByText("Vaak hit a startup problem in this window."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("reloads the main window from the recovery action", () => {
    const reloadWindow = vi.fn();

    renderApp(
      <RendererErrorBoundary windowLabel="main" reloadWindow={reloadWindow}>
        <BrokenChild />
      </RendererErrorBoundary>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reload" }));

    expect(reloadWindow).toHaveBeenCalledOnce();
  });

  it("keeps voice capsule errors invisible and schedules a reload", () => {
    vi.useFakeTimers();
    const reloadWindow = vi.fn();

    const { container } = renderApp(
      <RendererErrorBoundary
        windowLabel="voice-capsule"
        reloadWindow={reloadWindow}
      >
        <BrokenChild />
      </RendererErrorBoundary>,
    );

    expect(container).toBeEmptyDOMElement();

    vi.advanceTimersByTime(1_000);

    expect(reloadWindow).toHaveBeenCalledOnce();
  });

  it("reports renderer errors when running inside Tauri", () => {
    renderApp(
      <RendererErrorBoundary windowLabel="main" reloadWindow={vi.fn()}>
        <BrokenChild />
      </RendererErrorBoundary>,
    );

    expect(recordRendererError).toHaveBeenCalledWith(
      expect.objectContaining({
        windowLabel: "main",
        message: expect.stringContaining("startup render failed"),
      }),
    );
  });

  it("records the visible main-window recovery state", () => {
    renderApp(
      <RendererErrorBoundary windowLabel="main" reloadWindow={vi.fn()}>
        <BrokenChild />
      </RendererErrorBoundary>,
    );

    expect(recordStartupCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        windowLabel: "main",
        checkpoint: "renderer_recovery_displayed",
        detail: expect.stringContaining("startup render failed"),
      }),
    );
  });
});
