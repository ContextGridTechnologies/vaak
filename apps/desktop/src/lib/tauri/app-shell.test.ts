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
      voiceCapsulePlacement: {
        anchor: "bottomCenter",
      },
    });
    tauri.resolveCommand("save_app_shell_preferences", {
      sidebarCollapsed: true,
      voiceCapsulePlacement: {
        anchor: "bottomRight",
        offsetX: 40,
        offsetY: 24,
      },
    });

    await expect(getAppShellPreferences()).resolves.toEqual({
      sidebarCollapsed: false,
      voiceCapsulePlacement: {
        anchor: "bottomCenter",
      },
    });
    await expect(
      saveAppShellPreferences({
        sidebarCollapsed: true,
        voiceCapsulePlacement: {
          anchor: "bottomRight",
          offsetX: 40,
          offsetY: 24,
        },
      }),
    ).resolves.toEqual({
      sidebarCollapsed: true,
      voiceCapsulePlacement: {
        anchor: "bottomRight",
        offsetX: 40,
        offsetY: 24,
      },
    });

    expectTauriCommand(tauri, "get_app_shell_preferences", undefined);
    expectTauriCommand(tauri, "save_app_shell_preferences", {
      preferences: {
        sidebarCollapsed: true,
        voiceCapsulePlacement: {
          anchor: "bottomRight",
          offsetX: 40,
          offsetY: 24,
        },
      },
    });
  });
});
