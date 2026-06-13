import { invokeTauri } from "./runtime";

export const voiceCapsuleAnchors = [
  "bottomCenter",
  "bottomLeft",
  "bottomRight",
  "centerLeft",
  "centerRight",
  "topCenter",
] as const;

export type VoiceCapsuleAnchor = (typeof voiceCapsuleAnchors)[number];

export type VoiceCapsulePlacement = {
  anchor: VoiceCapsuleAnchor;
  offsetX?: number;
  offsetY?: number;
  monitor?: {
    workAreaX: number;
    workAreaY: number;
    workAreaWidth: number;
    workAreaHeight: number;
    scaleFactor?: number;
  };
};

export type AppShellPreferences = {
  sidebarCollapsed: boolean;
  voiceCapsuleEnabled: boolean;
  voiceCapsulePlacement?: VoiceCapsulePlacement;
};

export async function getAppShellPreferences(): Promise<AppShellPreferences> {
  return invokeTauri("get_app_shell_preferences");
}

export async function saveAppShellPreferences(
  preferences: AppShellPreferences,
): Promise<AppShellPreferences> {
  return invokeTauri("save_app_shell_preferences", { preferences });
}

export async function getVoiceCapsulePlacement(): Promise<VoiceCapsulePlacement> {
  return invokeTauri("get_voice_capsule_placement");
}

export async function saveVoiceCapsulePlacement(
  placement: VoiceCapsulePlacement,
): Promise<VoiceCapsulePlacement> {
  return invokeTauri("save_voice_capsule_placement", { placement });
}

export async function restartVoiceCapsule(): Promise<void> {
  return invokeTauri("restart_voice_capsule");
}

export async function resetVoiceCapsulePosition(): Promise<VoiceCapsulePlacement> {
  return invokeTauri("reset_voice_capsule_position");
}

export async function disableVoiceCapsule(): Promise<AppShellPreferences> {
  return invokeTauri("disable_voice_capsule");
}

export async function enableVoiceCapsule(): Promise<AppShellPreferences> {
  return invokeTauri("enable_voice_capsule");
}
