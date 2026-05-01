import {
  CloudCogIcon,
  CloudSyncIcon,
  LaptopMinimalCheckIcon,
  type LucideIcon,
} from "lucide-react";

export type OnboardingModeCardConfig = {
  id: "local" | "sync" | "managed";
  icon: LucideIcon;
  title: string;
  badge?: string;
  description?: string;
  points?: string[];
  actionLabel: string;
  selected?: boolean;
  future?: boolean;
};

export const onboardingModeCards: OnboardingModeCardConfig[] = [
  {
    id: "local",
    icon: LaptopMinimalCheckIcon,
    title: "Local setup",
    points: [
      "No account required",
      "Bring your own provider key",
      "Settings stay on this device",
    ],
    actionLabel: "Continue locally",
    selected: true,
  },
  {
    id: "sync",
    icon: CloudSyncIcon,
    title: "Sign in for sync",
    badge: "Coming soon",
    description: "Sync dictionary, snippets, and preferences later.",
    actionLabel: "Coming soon",
    future: true,
  },
  {
    id: "managed",
    icon: CloudCogIcon,
    title: "Managed Vaak",
    badge: "Coming soon",
    description:
      "Use Vaak without provider setup when managed plans are available.",
    actionLabel: "Coming soon",
    future: true,
  },
];
