import { invokeTauri } from "./runtime";

export type DiagnosticsLocations = {
  logDir: string;
  configDir: string;
};

export async function getDiagnosticsLocations(): Promise<DiagnosticsLocations> {
  return invokeTauri("get_diagnostics_locations");
}
