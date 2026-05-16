import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { renderApp } from "@/test/render";

import { ReleaseUpdateNotifier } from "./ReleaseUpdateNotifier";

describe("ReleaseUpdateNotifier", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("shows an upgrade prompt when GitHub has a newer release", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        tag_name: "v0.1.4",
        html_url:
          "https://github.com/ContextGridTechnologies/vaak/releases/tag/v0.1.4",
        assets: [
          {
            name: "Vaak-Windows-Setup.exe",
            browser_download_url:
              "https://github.com/ContextGridTechnologies/vaak/releases/download/v0.1.4/Vaak-Windows-Setup.exe",
          },
        ],
      }),
    }));

    vi.stubGlobal("fetch", fetch);

    renderApp(<ReleaseUpdateNotifier currentVersion="0.1.3" />);

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith(
        "Vaak 0.1.4 is available",
        expect.objectContaining({
          description: "Download the latest Windows installer from GitHub.",
        }),
      );
    });
  });

  it("does not show the same release prompt twice", async () => {
    localStorage.setItem("vaak.release.lastNotifiedVersion", "0.1.4");
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        tag_name: "v0.1.4",
        html_url:
          "https://github.com/ContextGridTechnologies/vaak/releases/tag/v0.1.4",
        assets: [],
      }),
    }));

    vi.stubGlobal("fetch", fetch);

    renderApp(<ReleaseUpdateNotifier currentVersion="0.1.3" />);

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(toast.info).not.toHaveBeenCalled();
  });
});
