import {
  AudioLinesIcon,
  BlocksIcon,
  BotIcon,
  ChartNoAxesCombinedIcon,
  InfoIcon,
  SlidersHorizontalIcon,
  type LucideIcon,
} from "lucide-react";

type AppSectionConfig = {
  value: "home" | "voiceAgent" | "mcps" | "analytics" | "settings" | "info";
  label: string;
  icon: LucideIcon;
};

export const primarySections: readonly AppSectionConfig[] = [
  {
    value: "home",
    label: "Voice",
    icon: AudioLinesIcon,
  },
  {
    value: "voiceAgent",
    label: "Voice Agent",
    icon: BotIcon,
  },
  {
    value: "mcps",
    label: "MCPs",
    icon: BlocksIcon,
  },
  {
    value: "analytics",
    label: "Analytics",
    icon: ChartNoAxesCombinedIcon,
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

export function getAppSections(environment?: unknown): readonly AppSectionConfig[] {
  void environment;

  return [...primarySections, ...utilitySections];
}

export const appSections = getAppSections();

export type AppSection = (typeof appSections)[number]["value"];
