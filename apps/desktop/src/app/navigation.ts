import { MicIcon, SettingsIcon } from "lucide-react";

export const appSections = [
  {
    value: "dictation",
    label: "Voice",
    icon: MicIcon,
  },
  {
    value: "settings",
    label: "Settings",
    icon: SettingsIcon,
  },
] as const;

export type AppSection = (typeof appSections)[number]["value"];
