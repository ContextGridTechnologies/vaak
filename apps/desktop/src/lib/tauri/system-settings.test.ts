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
      dictationMode: "streaming",
      launchOnStartup: true,
      showSkippedTranscripts: false,
    });
    tauri.resolveCommand("save_system_settings", {
      dictationMode: "standard",
      launchOnStartup: false,
      showSkippedTranscripts: true,
    });

    await expect(getSystemSettings()).resolves.toEqual({
      dictationMode: "streaming",
      launchOnStartup: true,
      showSkippedTranscripts: false,
    });
    await expect(
      saveSystemSettings({
        dictationMode: "standard",
        launchOnStartup: false,
        showSkippedTranscripts: true,
      }),
    ).resolves.toEqual({
      dictationMode: "standard",
      launchOnStartup: false,
      showSkippedTranscripts: true,
    });

    expectTauriCommand(tauri, "get_system_settings", undefined);
    expectTauriCommand(tauri, "save_system_settings", {
      settings: {
        dictationMode: "standard",
        launchOnStartup: false,
        showSkippedTranscripts: true,
      },
    });
  });
});
