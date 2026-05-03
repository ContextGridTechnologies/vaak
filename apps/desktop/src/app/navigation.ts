import { MicVocalIcon, SettingsIcon } from "lucide-react";

type AppSectionConfig = {
  value: "home" | "settings";
  label: string;
  icon: typeof MicVocalIcon;
};

export const primarySections: readonly AppSectionConfig[] = [
  {
    value: "home",
    label: "Voice",
    icon: MicVocalIcon,
  },
] as const;

export const utilitySections: readonly AppSectionConfig[] = [
  {
    value: "settings",
    label: "Settings",
    icon: SettingsIcon,
  },
] as const;

export const appSections = [...primarySections, ...utilitySections] as const;

export type AppSection = (typeof appSections)[number]["value"];
