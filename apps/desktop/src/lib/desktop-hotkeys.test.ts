import { describe, expect, it } from "vitest";

import {
  currentDesktopPlatform,
  defaultHotkeyBindingsForPlatform,
  desktopHotkeysSupported,
  reservedCommandModifierLabel,
  shortcutFromModifierEvent,
} from "./desktop-hotkeys";

function setPlatform(platform: string) {
  Object.defineProperty(navigator, "platform", {
    configurable: true,
    value: platform,
  });
}

describe("desktop hotkey defaults", () => {
  it("matches the backend defaults for macOS", () => {
    setPlatform("MacIntel");

    expect(currentDesktopPlatform()).toBe("macos");
    expect(desktopHotkeysSupported("macos")).toBe(true);
    expect(defaultHotkeyBindingsForPlatform()).toEqual({
      dictation: "Control+Command",
      command: "Control+Command+Option",
    });
    expect(reservedCommandModifierLabel("macos")).toBe("Option");
    expect(
      shortcutFromModifierEvent({
        altKey: false,
        ctrlKey: true,
        metaKey: true,
        shiftKey: false,
      }),
    ).toBe("Control+Command");
  });

  it("matches the backend defaults for Windows", () => {
    setPlatform("Win32");

    expect(currentDesktopPlatform()).toBe("windows");
    expect(desktopHotkeysSupported("windows")).toBe(true);
    expect(defaultHotkeyBindingsForPlatform()).toEqual({
      dictation: "Ctrl+Win",
      command: "Ctrl+Win+Alt",
    });
    expect(reservedCommandModifierLabel("windows")).toBe("Alt");
    expect(
      shortcutFromModifierEvent({
        altKey: false,
        ctrlKey: true,
        metaKey: true,
        shiftKey: false,
      }),
    ).toBe("Ctrl+Win");
  });
});
