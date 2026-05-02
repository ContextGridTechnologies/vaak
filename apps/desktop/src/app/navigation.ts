import { HomeIcon, SettingsIcon, UserRoundIcon } from "lucide-react";

type AppSectionConfig = {
  value: "home" | "settings" | "account";
  label: string;
  icon: typeof HomeIcon;
  disabled?: boolean;
  badge?: string;
};

export const primarySections: readonly AppSectionConfig[] = [
  {
    value: "home",
    label: "Home",
    icon: HomeIcon,
  },
  {
    value: "account",
    label: "Account",
    icon: UserRoundIcon,
    disabled: true,
    badge: "Coming soon",
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
