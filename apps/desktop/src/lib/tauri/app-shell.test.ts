import { describe, expect, it } from "vitest";

import {
  createTauriCommandHarness,
  expectTauriCommand,
} from "@/test/tauri";

import {
  disableVoiceCapsule,
  enableVoiceCapsule,
  getAppShellPreferences,
  resetVoiceCapsulePosition,
  restartVoiceCapsule,
  saveAppShellPreferences,
  voiceCapsuleAnchors,
} from "./app-shell";

describe("app shell Tauri API", () => {
  it("publishes all voice capsule snap anchors including top center", () => {
    expect(voiceCapsuleAnchors).toEqual([
      "bottomCenter",
      "bottomLeft",
      "bottomRight",
      "centerLeft",
      "centerRight",
      "topCenter",
    ]);
  });

  it("loads and saves non-secret app shell preferences through backend commands", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_app_shell_preferences", {
      sidebarCollapsed: false,
      voiceCapsuleEnabled: true,
      voiceCapsulePlacement: {
        anchor: "bottomCenter",
      },
    });
    tauri.resolveCommand("save_app_shell_preferences", {
      sidebarCollapsed: true,
      voiceCapsuleEnabled: true,
      voiceCapsulePlacement: {
        anchor: "bottomRight",
        offsetX: 40,
        offsetY: 24,
      },
    });

    await expect(getAppShellPreferences()).resolves.toEqual({
      sidebarCollapsed: false,
      voiceCapsuleEnabled: true,
      voiceCapsulePlacement: {
        anchor: "bottomCenter",
      },
    });
    await expect(
      saveAppShellPreferences({
        sidebarCollapsed: true,
        voiceCapsuleEnabled: true,
        voiceCapsulePlacement: {
          anchor: "bottomRight",
          offsetX: 40,
          offsetY: 24,
        },
      }),
    ).resolves.toEqual({
      sidebarCollapsed: true,
      voiceCapsuleEnabled: true,
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
        voiceCapsuleEnabled: true,
        voiceCapsulePlacement: {
          anchor: "bottomRight",
          offsetX: 40,
          offsetY: 24,
        },
      },
    });
  });

  it("exposes voice capsule recovery controls through backend commands", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("restart_voice_capsule", undefined);
    tauri.resolveCommand("reset_voice_capsule_position", {
      anchor: "bottomCenter",
      monitor: {
        workAreaX: 0,
        workAreaY: 0,
        workAreaWidth: 1920,
        workAreaHeight: 1040,
        scaleFactor: 1,
      },
    });
    tauri.resolveCommand("disable_voice_capsule", {
      sidebarCollapsed: false,
      voiceCapsuleEnabled: false,
    });
    tauri.resolveCommand("enable_voice_capsule", {
      sidebarCollapsed: false,
      voiceCapsuleEnabled: true,
    });

    await expect(restartVoiceCapsule()).resolves.toBeUndefined();
    await expect(resetVoiceCapsulePosition()).resolves.toEqual({
      anchor: "bottomCenter",
      monitor: {
        workAreaX: 0,
        workAreaY: 0,
        workAreaWidth: 1920,
        workAreaHeight: 1040,
        scaleFactor: 1,
      },
    });
    await expect(disableVoiceCapsule()).resolves.toEqual({
      sidebarCollapsed: false,
      voiceCapsuleEnabled: false,
    });
    await expect(enableVoiceCapsule()).resolves.toEqual({
      sidebarCollapsed: false,
      voiceCapsuleEnabled: true,
    });

    expectTauriCommand(tauri, "restart_voice_capsule", undefined);
    expectTauriCommand(tauri, "reset_voice_capsule_position", undefined);
    expectTauriCommand(tauri, "disable_voice_capsule", undefined);
    expectTauriCommand(tauri, "enable_voice_capsule", undefined);
  });
});
