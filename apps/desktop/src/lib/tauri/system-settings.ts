import { invokeTauri } from "./runtime";

export type SystemSettings = {
  launchOnStartup: boolean;
  showSkippedTranscripts: boolean;
};

export async function getSystemSettings(): Promise<SystemSettings> {
  return invokeTauri("get_system_settings");
}

export async function saveSystemSettings(
  settings: SystemSettings,
): Promise<SystemSettings> {
  return invokeTauri("save_system_settings", { settings });
}
