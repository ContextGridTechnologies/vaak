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
};

export type AppShellPreferences = {
  sidebarCollapsed: boolean;
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
