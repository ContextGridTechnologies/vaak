import type { HotkeyBindings } from "@/lib/tauri";

export type DesktopPlatform = "macos" | "windows" | "other";

export function currentDesktopPlatform(): DesktopPlatform {
  if (typeof navigator === "undefined") {
    return "other";
  }

  const platform = (
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ||
    navigator.platform ||
    ""
  ).toLowerCase();

  if (platform.includes("mac")) {
    return "macos";
  }
  if (platform.includes("win")) {
    return "windows";
  }
  return "other";
}

export function desktopHotkeysSupported(platform: DesktopPlatform): boolean {
  return platform === "macos" || platform === "windows";
}

export function defaultHotkeyBindingsForPlatform(
  platform: DesktopPlatform = currentDesktopPlatform(),
): HotkeyBindings {
  if (platform === "macos") {
    return {
      dictation: "Control+Command",
      command: "Control+Command+Option",
    };
  }

  return {
    dictation: "Ctrl+Win",
    command: "Ctrl+Win+Alt",
  };
}

export function shortcutFromModifierEvent(
  event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">,
  platform: DesktopPlatform = currentDesktopPlatform(),
): string {
  const macos = platform === "macos";
  const parts: string[] = [];

  if (event.ctrlKey) {
    parts.push(macos ? "Control" : "Ctrl");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }
  if (event.metaKey) {
    parts.push(macos ? "Command" : "Win");
  }
  if (event.altKey) {
    parts.push(macos ? "Option" : "Alt");
  }

  return parts.join("+");
}

export function reservedCommandModifierLabel(platform: DesktopPlatform): string {
  return platform === "macos" ? "Option" : "Alt";
}

export function alternateDictationShortcutLabel(platform: DesktopPlatform): string {
  return platform === "macos" ? "Control + Shift" : "Ctrl + Shift";
}
