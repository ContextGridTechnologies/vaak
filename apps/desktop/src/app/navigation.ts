import {
  AudioLinesIcon,
  ChartNoAxesCombinedIcon,
  InfoIcon,
  SlidersHorizontalIcon,
  type LucideIcon,
} from "lucide-react";

import { appEnvironment, type AppEnvironment } from "@/config/app-env";

type AppSectionConfig = {
  value: "home" | "analytics" | "settings" | "info";
  label: string;
  icon: LucideIcon;
};

export const primarySections: readonly AppSectionConfig[] = [
  {
    value: "home",
    label: "Voice",
    icon: AudioLinesIcon,
  },
] as const;

export const utilitySections: readonly AppSectionConfig[] = [
  {
    value: "settings",
    label: "Settings",
    icon: SlidersHorizontalIcon,
  },
  {
    value: "info",
    label: "Info",
    icon: InfoIcon,
  },
] as const;

export function getAppSections(
  environment: Pick<AppEnvironment, "appEnv"> = appEnvironment,
): readonly AppSectionConfig[] {
  const developerSections: readonly AppSectionConfig[] =
    environment.appEnv === "development"
      ? [
          {
            value: "analytics",
            label: "Analytics",
            icon: ChartNoAxesCombinedIcon,
          },
        ]
      : [];

  return [...primarySections, ...developerSections, ...utilitySections];
}

export const appSections = getAppSections();

export type AppSection = (typeof appSections)[number]["value"];
