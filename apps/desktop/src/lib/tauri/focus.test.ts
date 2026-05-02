import { describe, expect, it } from "vitest";

import {
  createTauriCommandHarness,
  expectTauriCommand,
} from "@/test/tauri";

import { getHotkeyBindings, saveDictationHotkey } from "./focus";

describe("focus Tauri API", () => {
  it("loads and saves dictation hotkey bindings through backend commands", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_hotkey_bindings", {
      dictation: "Ctrl+Win",
      command: "Ctrl+Win+Alt",
    });
    tauri.resolveCommand("save_dictation_hotkey", {
      dictation: "Ctrl+Shift",
      command: "Ctrl+Shift+Alt",
    });

    await expect(getHotkeyBindings()).resolves.toEqual({
      dictation: "Ctrl+Win",
      command: "Ctrl+Win+Alt",
    });
    await expect(saveDictationHotkey("Ctrl+Shift")).resolves.toEqual({
      dictation: "Ctrl+Shift",
      command: "Ctrl+Shift+Alt",
    });

    expectTauriCommand(tauri, "get_hotkey_bindings", undefined);
    expectTauriCommand(tauri, "save_dictation_hotkey", {
      shortcut: "Ctrl+Shift",
    });
  });
});
