import {
  AudioLinesIcon,
  SlidersHorizontalIcon,
  type LucideIcon,
} from "lucide-react";

type AppSectionConfig = {
  value: "home" | "settings";
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
] as const;

export const appSections = [...primarySections, ...utilitySections] as const;

export type AppSection = (typeof appSections)[number]["value"];
