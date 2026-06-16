import {
  ActivityIcon,
  AudioLinesIcon,
  KeyboardIcon,
  MicIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  StethoscopeIcon,
  type LucideIcon,
} from "lucide-react";

export type SettingsSectionId =
  | "speech-provider"
  | "transcription-mode"
  | "microphone"
  | "keyboard-shortcut"
  | "voice-capsule"
  | "system"
  | "diagnostics";

export type SettingsSectionConfig = {
  value: SettingsSectionId;
  label: string;
  icon: LucideIcon;
};

export const defaultSettingsSection: SettingsSectionId = "speech-provider";

export const settingsSections: readonly SettingsSectionConfig[] = [
  {
    value: "speech-provider",
    label: "Speech provider",
    icon: AudioLinesIcon,
  },
  {
    value: "transcription-mode",
    label: "Transcription mode",
    icon: ActivityIcon,
  },
  {
    value: "microphone",
    label: "Microphone",
    icon: MicIcon,
  },
  {
    value: "keyboard-shortcut",
    label: "Keyboard shortcut",
    icon: KeyboardIcon,
  },
  {
    value: "voice-capsule",
    label: "Voice capsule",
    icon: SlidersHorizontalIcon,
  },
  {
    value: "system",
    label: "System",
    icon: SettingsIcon,
  },
  {
    value: "diagnostics",
    label: "Diagnostics",
    icon: StethoscopeIcon,
  },
] as const;
