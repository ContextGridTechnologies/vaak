import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

import {
  defaultSettingsSection,
  type SettingsSectionId,
} from "./settingsNavigation";

type SettingsNavigationContextValue = {
  activeSection: SettingsSectionId;
  setActiveSection: (section: SettingsSectionId) => void;
};

const SettingsNavigationContext =
  createContext<SettingsNavigationContextValue | null>(null);

type SettingsNavigationProviderProps = SettingsNavigationContextValue & {
  children: ReactNode;
};

export function SettingsNavigationProvider({
  activeSection,
  children,
  setActiveSection,
}: SettingsNavigationProviderProps) {
  return (
    <SettingsNavigationContext.Provider
      value={{ activeSection, setActiveSection }}
    >
      {children}
    </SettingsNavigationContext.Provider>
  );
}

export function useSettingsNavigation() {
  return (
    useContext(SettingsNavigationContext) ?? {
      activeSection: defaultSettingsSection,
      setActiveSection: () => {},
    }
  );
}
