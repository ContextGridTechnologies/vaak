export type GitHubRelease = {
  version: string;
  releaseUrl: string;
  assets: Array<{
    name: string;
    downloadUrl: string;
  }>;
};

export type ReleaseUpdate = {
  version: string;
  releaseUrl: string;
  installerUrl: string;
};

type GitHubReleasePayload = {
  tag_name?: unknown;
  html_url?: unknown;
  assets?: unknown;
};

type GitHubReleaseAssetPayload = {
  name?: unknown;
  browser_download_url?: unknown;
};

const installerAssetName = "Vaak-Windows-Setup.exe";

export function parseGitHubRelease(payload: unknown): GitHubRelease {
  const release = payload as GitHubReleasePayload;
  const tagName = typeof release.tag_name === "string" ? release.tag_name : "";
  const releaseUrl = typeof release.html_url === "string" ? release.html_url : "";
  const assets = Array.isArray(release.assets) ? release.assets : [];

  return {
    version: tagName.replace(/^v/i, ""),
    releaseUrl,
    assets: assets
      .map((asset): GitHubRelease["assets"][number] | null => {
        const releaseAsset = asset as GitHubReleaseAssetPayload;
        if (
          typeof releaseAsset.name !== "string" ||
          typeof releaseAsset.browser_download_url !== "string"
        ) {
          return null;
        }

        return {
          name: releaseAsset.name,
          downloadUrl: releaseAsset.browser_download_url,
        };
      })
      .filter((asset): asset is GitHubRelease["assets"][number] =>
        Boolean(asset),
      ),
  };
}

export function isNewerVersion(
  latestVersion: string,
  currentVersion: string,
): boolean {
  const latestParts = parseVersionParts(latestVersion);
  const currentParts = parseVersionParts(currentVersion);

  for (let index = 0; index < latestParts.length; index += 1) {
    if (latestParts[index] > currentParts[index]) {
      return true;
    }

    if (latestParts[index] < currentParts[index]) {
      return false;
    }
  }

  return false;
}

export function getInstallerDownloadUrl(release: GitHubRelease): string {
  return (
    release.assets.find((asset) => asset.name === installerAssetName)
      ?.downloadUrl ?? release.releaseUrl
  );
}

export function getReleaseUpdate(
  release: GitHubRelease,
  currentVersion: string,
): ReleaseUpdate | null {
  if (!isNewerVersion(release.version, currentVersion)) {
    return null;
  }

  return {
    version: release.version,
    releaseUrl: release.releaseUrl,
    installerUrl: getInstallerDownloadUrl(release),
  };
}

function parseVersionParts(version: string): [number, number, number] {
  const parts = version
    .replace(/^v/i, "")
    .split(".")
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10));

  return [
    Number.isFinite(parts[0]) ? parts[0] : 0,
    Number.isFinite(parts[1]) ? parts[1] : 0,
    Number.isFinite(parts[2]) ? parts[2] : 0,
  ];
}
