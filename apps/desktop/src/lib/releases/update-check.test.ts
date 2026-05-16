import { describe, expect, it } from "vitest";

import {
  getInstallerDownloadUrl,
  getReleaseUpdate,
  isNewerVersion,
  parseGitHubRelease,
} from "./update-check";

describe("release update checks", () => {
  it("treats a higher semantic version as newer", () => {
    expect(isNewerVersion("0.1.3", "0.1.2")).toBe(true);
    expect(isNewerVersion("0.2.0", "0.1.9")).toBe(true);
    expect(isNewerVersion("1.0.0", "0.9.9")).toBe(true);
  });

  it("does not treat the same or lower version as newer", () => {
    expect(isNewerVersion("0.1.3", "0.1.3")).toBe(false);
    expect(isNewerVersion("0.1.2", "0.1.3")).toBe(false);
  });

  it("builds an update only when the latest GitHub release is newer", () => {
    const release = parseGitHubRelease({
      tag_name: "v0.1.4",
      html_url: "https://github.com/ContextGridTechnologies/vaak/releases/tag/v0.1.4",
      assets: [
        {
          name: "Vaak-Windows-Setup.exe",
          browser_download_url:
            "https://github.com/ContextGridTechnologies/vaak/releases/download/v0.1.4/Vaak-Windows-Setup.exe",
        },
      ],
    });

    expect(getReleaseUpdate(release, "0.1.3")).toEqual({
      version: "0.1.4",
      releaseUrl:
        "https://github.com/ContextGridTechnologies/vaak/releases/tag/v0.1.4",
      installerUrl:
        "https://github.com/ContextGridTechnologies/vaak/releases/download/v0.1.4/Vaak-Windows-Setup.exe",
    });
  });

  it("falls back to the release page when the installer asset is absent", () => {
    const release = parseGitHubRelease({
      tag_name: "v0.1.4",
      html_url: "https://github.com/ContextGridTechnologies/vaak/releases/tag/v0.1.4",
      assets: [],
    });

    expect(getInstallerDownloadUrl(release)).toBe(
      "https://github.com/ContextGridTechnologies/vaak/releases/tag/v0.1.4",
    );
  });
});
