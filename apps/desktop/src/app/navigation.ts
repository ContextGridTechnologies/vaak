import {
  ActivityIcon,
  MicIcon,
  SettingsIcon,
  TerminalIcon,
} from "lucide-react";

export const appSections = [
  {
    value: "dictation",
    label: "Dictation",
    icon: MicIcon,
  },
  {
    value: "command-mode",
    label: "Command",
    icon: TerminalIcon,
  },
  {
    value: "settings",
    label: "Settings",
    icon: SettingsIcon,
  },
  {
    value: "diagnostics",
    label: "Diagnostics",
    icon: ActivityIcon,
  },
] as const;

export type AppSection = (typeof appSections)[number]["value"];
