import { describe, expect, it } from "vitest";

import {
  createTauriCommandHarness,
  expectTauriCommand,
} from "@/test/tauri";

import { getAppShellPreferences, saveAppShellPreferences } from "./app-shell";

describe("app shell Tauri API", () => {
  it("loads and saves non-secret app shell preferences through backend commands", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_app_shell_preferences", {
      sidebarCollapsed: false,
    });
    tauri.resolveCommand("save_app_shell_preferences", {
      sidebarCollapsed: true,
    });

    await expect(getAppShellPreferences()).resolves.toEqual({
      sidebarCollapsed: false,
    });
    await expect(
      saveAppShellPreferences({ sidebarCollapsed: true }),
    ).resolves.toEqual({ sidebarCollapsed: true });

    expectTauriCommand(tauri, "get_app_shell_preferences", undefined);
    expectTauriCommand(tauri, "save_app_shell_preferences", {
      preferences: { sidebarCollapsed: true },
    });
  });
});
