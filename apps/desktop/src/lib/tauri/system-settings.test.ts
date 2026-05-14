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
    });
    tauri.resolveCommand("save_system_settings", {
      launchOnStartup: false,
    });

    await expect(getSystemSettings()).resolves.toEqual({
      launchOnStartup: true,
    });
    await expect(
      saveSystemSettings({
        launchOnStartup: false,
      }),
    ).resolves.toEqual({
      launchOnStartup: false,
    });

    expectTauriCommand(tauri, "get_system_settings", undefined);
    expectTauriCommand(tauri, "save_system_settings", {
      settings: {
        launchOnStartup: false,
      },
    });
  });
});
