import { useEffect } from "react";
import { toast } from "sonner";

import {
  getReleaseUpdate,
  parseGitHubRelease,
  type ReleaseUpdate,
} from "@/lib/releases/update-check";

type ReleaseUpdateNotifierProps = {
  currentVersion?: string;
};

const latestReleaseApiUrl =
  "https://api.github.com/repos/ContextGridTechnologies/vaak/releases/latest";
const notifiedVersionStorageKey = "vaak.release.lastNotifiedVersion";
const releaseCheckIntervalMs = 3 * 60 * 60 * 1000;

export function ReleaseUpdateNotifier({
  currentVersion = __APP_VERSION__,
}: ReleaseUpdateNotifierProps) {
  useEffect(() => {
    let cancelled = false;

    async function checkForUpdate() {
      try {
        const response = await fetch(latestReleaseApiUrl, {
          headers: {
            Accept: "application/vnd.github+json",
          },
        });

        if (!response.ok) {
          return;
        }

        const release = parseGitHubRelease(await response.json());
        const update = getReleaseUpdate(release, currentVersion);

        if (!cancelled && update) {
          notifyUpdate(update);
        }
      } catch {
        // Update checks must never interrupt local dictation.
      }
    }

    void checkForUpdate();
    const intervalId = window.setInterval(
      () => void checkForUpdate(),
      releaseCheckIntervalMs,
    );

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [currentVersion]);

  return null;
}

function notifyUpdate(update: ReleaseUpdate) {
  if (localStorage.getItem(notifiedVersionStorageKey) === update.version) {
    return;
  }

  localStorage.setItem(notifiedVersionStorageKey, update.version);
  toast.info(`Vaak ${update.version} is available`, {
    description: "Download the latest Windows installer from GitHub.",
    action: {
      label: "Download",
      onClick: () => {
        window.open(update.installerUrl, "_blank", "noopener,noreferrer");
      },
    },
  });
}
