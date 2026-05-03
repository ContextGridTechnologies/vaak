import {
  CloudCogIcon,
  LaptopMinimalCheckIcon,
  type LucideIcon,
} from "lucide-react";

export type OnboardingModeCardConfig = {
  id: "local" | "managed";
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
