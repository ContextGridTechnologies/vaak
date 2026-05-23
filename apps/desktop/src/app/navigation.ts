import {
  AudioLinesIcon,
  InfoIcon,
  SlidersHorizontalIcon,
  type LucideIcon,
} from "lucide-react";

type AppSectionConfig = {
  value: "home" | "settings" | "info";
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

export const appSections = [...primarySections, ...utilitySections] as const;

export type AppSection = (typeof appSections)[number]["value"];
