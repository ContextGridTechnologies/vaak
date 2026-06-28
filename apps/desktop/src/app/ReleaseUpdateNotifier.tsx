import { useEffect } from "react";
import { toast } from "sonner";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

import { isTauriRuntime } from "@/lib/tauri";

const releaseCheckIntervalMs = 60 * 60 * 1000;

export function ReleaseUpdateNotifier() {
  useEffect(() => {
    let cancelled = false;

    async function checkForUpdate() {
      if (!isTauriRuntime()) {
        return;
      }

      try {
        const update = await check();

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
  }, []);

  return null;
}

function notifyUpdate(update: Update) {
  toast.info(`Vaak ${update.version} is ready to install`, {
    description: "Install the update now, or keep working and update later.",
    duration: Infinity,
    action: {
      label: "Update now",
      onClick: async () => {
        try {
          await update.downloadAndInstall();
          await relaunch();
        } catch (err) {
          toast.error("Update failed", {
            description:
              err instanceof Error ? err.message : "Could not install the update.",
          });
        }
      },
    },
    cancel: {
      label: "Later",
      onClick: () => {},
    },
  });
}
