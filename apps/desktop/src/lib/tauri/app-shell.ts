import { invokeTauri } from "./runtime";

export type AppShellPreferences = {
  sidebarCollapsed: boolean;
};

export async function getAppShellPreferences(): Promise<AppShellPreferences> {
  return invokeTauri("get_app_shell_preferences");
}

export async function saveAppShellPreferences(
  preferences: AppShellPreferences,
): Promise<AppShellPreferences> {
  return invokeTauri("save_app_shell_preferences", { preferences });
}
