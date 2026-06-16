import { invokeTauri } from "./runtime";

export type DictationMode = "auto" | "streaming" | "standard";

export type SystemSettings = {
  dictationMode: DictationMode;
  launchOnStartup: boolean;
  showSkippedTranscripts: boolean;
};

export const SYSTEM_SETTINGS_CHANGED_EVENT =
  "vaak://system-settings-changed";

export async function getSystemSettings(): Promise<SystemSettings> {
  return invokeTauri("get_system_settings");
}

export async function saveSystemSettings(
  settings: SystemSettings,
): Promise<SystemSettings> {
  return invokeTauri("save_system_settings", { settings });
}
