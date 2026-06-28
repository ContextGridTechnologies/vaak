import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { renderApp } from "@/test/render";

import { ReleaseUpdateNotifier } from "./ReleaseUpdateNotifier";

const updaterApi = vi.hoisted(() => ({
  check: vi.fn(),
}));

const processApi = vi.hoisted(() => ({
  relaunch: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-updater", () => updaterApi);
vi.mock("@tauri-apps/plugin-process", () => processApi);

describe("ReleaseUpdateNotifier", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("checks for updates on launch and hourly while the app is open", async () => {
    vi.useFakeTimers();
    updaterApi.check.mockResolvedValue(null);
    vi.stubGlobal("__TAURI_INTERNALS__", {});

    renderApp(<ReleaseUpdateNotifier />);

    expect(updaterApi.check).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(updaterApi.check).toHaveBeenCalledTimes(2);
  });

  it("installs an accepted update and relaunches the app", async () => {
    const update = {
      version: "0.1.4",
      downloadAndInstall: vi.fn().mockResolvedValue(undefined),
    };
    updaterApi.check.mockResolvedValue(update);
    processApi.relaunch.mockResolvedValue(undefined);
    vi.stubGlobal("__TAURI_INTERNALS__", {});

    renderApp(<ReleaseUpdateNotifier />);

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith(
        "Vaak 0.1.4 is ready to install",
        expect.objectContaining({
          action: expect.objectContaining({ label: "Update now" }),
          cancel: expect.objectContaining({ label: "Later" }),
          duration: Infinity,
        }),
      );
    });

    const toastOptions = vi.mocked(toast.info).mock.calls[0]?.[1] as {
      action?: { onClick?: () => void | Promise<void> };
    };

    await toastOptions.action?.onClick?.();

    expect(update.downloadAndInstall).toHaveBeenCalled();
    expect(processApi.relaunch).toHaveBeenCalled();
  });
});
