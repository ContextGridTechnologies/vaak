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
  description: string;
  icon: LucideIcon;
};

export const defaultSettingsSection: SettingsSectionId = "speech-provider";

export const settingsSections: readonly SettingsSectionConfig[] = [
  {
    value: "speech-provider",
    label: "Speech provider",
    description: "Choose the transcription provider Vaak uses for dictation.",
    icon: AudioLinesIcon,
  },
  {
    value: "transcription-mode",
    label: "Transcription mode",
    description: "Choose whether Vaak prioritizes speed or final transcript quality.",
    icon: ActivityIcon,
  },
  {
    value: "microphone",
    label: "Microphone",
    description: "Choose the input device Vaak uses for dictation.",
    icon: MicIcon,
  },
  {
    value: "keyboard-shortcut",
    label: "Keyboard shortcut",
    description: "Change the hold-to-talk shortcut used by the voice capsule.",
    icon: KeyboardIcon,
  },
  {
    value: "voice-capsule",
    label: "Voice capsule",
    description: "Control the floating voice control used for dictation.",
    icon: SlidersHorizontalIcon,
  },
  {
    value: "system",
    label: "System",
    description: "Control how Vaak integrates with your desktop session.",
    icon: SettingsIcon,
  },
  {
    value: "diagnostics",
    label: "Diagnostics",
    description: "Review local logs and support files before sharing them.",
    icon: StethoscopeIcon,
  },
] as const;
