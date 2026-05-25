import { describe, expect, it } from "vitest";

import {
  createTauriCommandHarness,
  expectTauriCommand,
} from "@/test/tauri";

import { getSystemSettings, saveSystemSettings } from "./system-settings";

describe("system settings Tauri API", () => {
  it("loads and saves startup launch preference through backend commands", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_system_settings", {
      launchOnStartup: true,
      showSkippedTranscripts: false,
    });
    tauri.resolveCommand("save_system_settings", {
      launchOnStartup: false,
      showSkippedTranscripts: true,
    });

    await expect(getSystemSettings()).resolves.toEqual({
      launchOnStartup: true,
      showSkippedTranscripts: false,
    });
    await expect(
      saveSystemSettings({
        launchOnStartup: false,
        showSkippedTranscripts: true,
      }),
    ).resolves.toEqual({
      launchOnStartup: false,
      showSkippedTranscripts: true,
    });

    expectTauriCommand(tauri, "get_system_settings", undefined);
    expectTauriCommand(tauri, "save_system_settings", {
      settings: {
        launchOnStartup: false,
        showSkippedTranscripts: true,
      },
    });
  });
});
