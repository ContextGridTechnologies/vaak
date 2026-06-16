import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  getAppShellPreferences,
  isTauriRuntime,
  recordStartupCheckpoint,
  saveAppShellPreferences,
  type AppShellPreferences,
} from "@/lib/tauri";
import appIconUrl from "../../src-tauri/icons/32x32.png?url";
import { appSections, type AppSection } from "./navigation";
import {
  defaultSettingsSection,
  settingsSections,
  type SettingsSectionId,
} from "@/features/settings/settingsNavigation";
import { SettingsNavigationProvider } from "@/features/settings/SettingsNavigationContext";

type AppLayoutProps = {
  notice?: ReactNode;
  children: ReactNode;
};

const COMPACT_VIEWPORT_MAX_WIDTH = 960;
const DEFAULT_APP_SHELL_PREFERENCES: AppShellPreferences = {
  sidebarCollapsed: false,
  voiceCapsuleEnabled: true,
};

export function AppLayout({ notice, children }: AppLayoutProps) {
  const [activeSection, setActiveSection] = useState<AppSection>("home");
  const [settingsActiveSection, setSettingsActiveSection] =
    useState<SettingsSectionId>(defaultSettingsSection);
  const [previousSectionBeforeSettings, setPreviousSectionBeforeSettings] =
    useState<AppSection>("home");
  const [compactViewport, setCompactViewport] = useState(() =>
    isCompactViewport(),
  );
  const [appShellPreferences, setAppShellPreferences] =
    useState<AppShellPreferences>(DEFAULT_APP_SHELL_PREFERENCES);
  const [sidebarPreferenceOpen, setSidebarPreferenceOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(() => !isCompactViewport());

  useEffect(() => {
    const syncViewport = () => {
      const compact = isCompactViewport();
      setCompactViewport(compact);
      setSidebarOpen(compact ? false : sidebarPreferenceOpen);
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);

    return () => {
      window.removeEventListener("resize", syncViewport);
    };
  }, [sidebarPreferenceOpen]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    void recordStartupCheckpoint({
      windowLabel: "main",
      checkpoint: "app_shell_mounted",
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    void recordStartupCheckpoint({
      windowLabel: "main",
      checkpoint: "app_shell_preferences_requested",
    }).catch(() => {});
    void getAppShellPreferences()
      .then((preferences) => {
        const loadedPreferences = normalizeAppShellPreferences(preferences);
        const preferredOpen = !loadedPreferences.sidebarCollapsed;
        void recordStartupCheckpoint({
          windowLabel: "main",
          checkpoint: "app_shell_preferences_loaded",
          detail: sidebarCheckpointDetail(loadedPreferences),
        }).catch(() => {});
        setAppShellPreferences(loadedPreferences);
        setSidebarPreferenceOpen(preferredOpen);
        setSidebarOpen(isCompactViewport() ? false : preferredOpen);
      })
      .catch((error: unknown) => {
        void recordStartupCheckpoint({
          windowLabel: "main",
          checkpoint: "app_shell_preferences_failed",
          detail: error instanceof Error ? error.message : "unknown",
        }).catch(() => {});
        console.error("Failed to load app shell preferences", error);
      });
  }, []);

  const handleSidebarOpenChange = useCallback((open: boolean) => {
    setSidebarPreferenceOpen(open);
    setSidebarOpen(compactViewport ? false : open);
    const nextPreferences = {
      ...appShellPreferences,
      sidebarCollapsed: !open,
    };
    setAppShellPreferences(nextPreferences);

    if (!isTauriRuntime()) {
      return;
    }

    void saveAppShellPreferences(nextPreferences).catch(
      (error: unknown) => {
        console.error("Failed to save app shell preferences", error);
      },
    );
  }, [appShellPreferences, compactViewport]);

  const settingsMode = activeSection === "settings";
  const displayedSidebarSections = settingsMode ? settingsSections : appSections;

  const activateAppSection = useCallback((section: AppSection) => {
    if (section === "settings") {
      setPreviousSectionBeforeSettings((currentPreviousSection) =>
        activeSection === "settings" ? currentPreviousSection : activeSection,
      );
      setSettingsActiveSection(defaultSettingsSection);
    }
    setActiveSection(section);
  }, [activeSection]);

  const handleTabsValueChange = useCallback((value: string) => {
    activateAppSection(value as AppSection);
  }, [activateAppSection]);

  const leaveSettings = useCallback(() => {
    setActiveSection(
      previousSectionBeforeSettings === "settings"
        ? "home"
        : previousSectionBeforeSettings,
    );
  }, [previousSectionBeforeSettings]);

  return (
    <Tabs
      value={activeSection}
      onValueChange={handleTabsValueChange}
      className="h-full min-h-full"
    >
      <SidebarProvider
        open={sidebarOpen}
        onOpenChange={handleSidebarOpenChange}
        data-testid="app-shell"
        className="vaak-content-surface h-full min-h-full overflow-hidden text-foreground"
        style={
          {
            "--sidebar-width": settingsMode ? "14.5rem" : "11.75rem",
          } as React.CSSProperties
        }
      >
        <Sidebar
          data-testid="app-sidebar"
          data-collapsible="icon"
          collapsible="icon"
          className="relative border-r border-sidebar-border/60 [&_[data-sidebar=sidebar]]:bg-sidebar [&_[data-sidebar=sidebar]]:shadow-[inset_-1px_0_0_rgb(15_23_42/0.035)]"
        >
          <SidebarHeader className={cn("px-3", settingsMode ? "py-2.5" : "py-3.5")}>
            <div className="flex min-w-0 items-center gap-2">
              <img
                src={appIconUrl}
                alt=""
                aria-hidden="true"
                data-testid="app-sidebar-brand-mark"
                className={cn(
                  "shrink-0 rounded-md border border-sidebar-border bg-background shadow-xs",
                  settingsMode ? "size-7" : "size-8",
                )}
              />
              <span
                className={cn(
                  "truncate font-semibold tracking-tight text-sidebar-foreground group-data-[collapsible=icon]:group-data-[state=collapsed]:hidden",
                  settingsMode ? "text-base" : "text-[1.3rem]",
                )}
              >
                Vaak
              </span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup className="px-2 py-1" data-testid="app-sidebar-primary">
              <SidebarGroupContent>
                <SidebarMenu
                  aria-label={settingsMode ? "Settings navigation" : "Primary navigation"}
                  className="gap-1"
                >
                  {displayedSidebarSections.map((section) => {
                    const Icon = section.icon;
                    const isActive = settingsMode
                      ? settingsActiveSection === section.value
                      : activeSection === section.value;

                    return (
                      <SidebarMenuItem key={section.value}>
                        {isActive ? (
                          <span
                            aria-hidden="true"
                            className="absolute top-3 bottom-3 left-1 w-0.5 rounded-full bg-primary"
                          />
                        ) : null}
                        <SidebarMenuButton
                          type="button"
                          isActive={isActive}
                          tooltip={section.label}
                          aria-label={section.label}
                          className={cn(
                            "h-8 rounded-md px-2.5 text-sm text-sidebar-foreground/78 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground data-[active=true]:bg-background data-[active=true]:text-sidebar-foreground data-[active=true]:shadow-xs",
                            settingsMode
                              ? "font-normal [&>span:last-child]:overflow-visible [&>span:last-child]:text-clip [&>span:last-child]:whitespace-normal"
                              : "font-medium",
                          )}
                          onClick={() => {
                            if (settingsMode) {
                              setSettingsActiveSection(section.value as SettingsSectionId);
                              return;
                            }

                            activateAppSection(section.value as AppSection);
                          }}
                        >
                          <span
                            aria-hidden="true"
                            className="flex size-6 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/62 group-data-[state=collapsed]/sidebar-wrapper:size-4 group-data-[active=true]/menu-button:bg-primary/10 group-data-[active=true]/menu-button:text-primary"
                          >
                            <Icon
                              data-icon="inline-start"
                              data-testid={
                                settingsMode
                                  ? `app-sidebar-settings-icon-${section.value}`
                                  : `app-sidebar-nav-icon-${section.value}`
                              }
                            />
                          </span>
                          <span>{section.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          {settingsMode ? (
            <SidebarFooter className="mt-auto px-2 py-3">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    type="button"
                    tooltip="Back to Voice"
                    aria-label="Back to Voice"
                    className="h-8 rounded-md px-2.5 text-sm font-medium text-sidebar-foreground/78 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
                    onClick={leaveSettings}
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-6 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/62 group-data-[state=collapsed]/sidebar-wrapper:size-4"
                    >
                      <ChevronLeftIcon data-icon="inline-start" />
                    </span>
                    <span>Back to Voice</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarFooter>
          ) : null}
          <SidebarDockToggle />
        </Sidebar>
        <SidebarInset className="min-w-0 overflow-hidden bg-transparent">
          <ScrollArea
            data-testid="app-content-scroll-region"
            className="flex-1 p-0"
          >
            {notice ? (
              <div
                data-testid="app-shell-notice"
                className="mx-auto w-full max-w-[68rem] px-4 pt-4 sm:px-6"
              >
                {notice}
              </div>
            ) : null}
            <SettingsNavigationProvider
              activeSection={settingsActiveSection}
              setActiveSection={setSettingsActiveSection}
            >
              {children}
            </SettingsNavigationProvider>
          </ScrollArea>
        </SidebarInset>
      </SidebarProvider>
    </Tabs>
  );
}

function isCompactViewport() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.innerWidth < COMPACT_VIEWPORT_MAX_WIDTH;
}

function sidebarCheckpointDetail(preferences: AppShellPreferences): string {
  return preferences.sidebarCollapsed
    ? "sidebarCollapsed=true"
    : "sidebarCollapsed=false";
}

function normalizeAppShellPreferences(
  preferences: AppShellPreferences,
): AppShellPreferences {
  return {
    ...DEFAULT_APP_SHELL_PREFERENCES,
    ...preferences,
  };
}

function SidebarDockToggle() {
  const { open, toggleSidebar } = useSidebar();

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      aria-label="Toggle Sidebar"
      data-testid="app-sidebar-dock-toggle"
      className="absolute right-0 bottom-3 z-10 size-7 translate-x-1/2 rounded-md border-sidebar-border bg-card shadow-sm"
      onClick={toggleSidebar}
    >
      {open ? <ChevronLeftIcon data-icon="icon" /> : <ChevronRightIcon data-icon="icon" />}
    </Button>
  );
}
