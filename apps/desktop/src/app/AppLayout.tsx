import { useCallback, useEffect, useState, type ReactNode } from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Tabs } from "@/components/ui/tabs";
import {
  getAppShellPreferences,
  isTauriRuntime,
  saveAppShellPreferences,
} from "@/lib/tauri";
import {
  primarySections,
  utilitySections,
  type AppSection,
} from "./navigation";

type AppLayoutProps = {
  notice?: ReactNode;
  children: ReactNode;
};

export function AppLayout({ notice, children }: AppLayoutProps) {
  const [activeSection, setActiveSection] = useState<AppSection>("home");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    void getAppShellPreferences()
      .then((preferences) => {
        setSidebarOpen(!preferences.sidebarCollapsed);
      })
      .catch((error: unknown) => {
        console.error("Failed to load app shell preferences", error);
      });
  }, []);

  const handleSidebarOpenChange = useCallback((open: boolean) => {
    setSidebarOpen(open);

    if (!isTauriRuntime()) {
      return;
    }

    void saveAppShellPreferences({ sidebarCollapsed: !open }).catch(
      (error: unknown) => {
        console.error("Failed to save app shell preferences", error);
      },
    );
  }, []);

  return (
    <Tabs
      value={activeSection}
      onValueChange={(value) => setActiveSection(value as AppSection)}
      className="h-full min-h-full"
    >
      <SidebarProvider
        open={sidebarOpen}
        onOpenChange={handleSidebarOpenChange}
        data-testid="app-shell"
        className="h-full min-h-full bg-background text-foreground"
      >
        <Sidebar
          data-testid="app-sidebar"
          data-collapsible="icon"
          collapsible="icon"
        >
          <SidebarContent>
            <SidebarGroup data-testid="app-sidebar-primary">
              <SidebarGroupContent>
                <SidebarMenu aria-label="Primary navigation">
                  {primarySections.map((section) => {
                    const Icon = section.icon;

                    return (
                      <SidebarMenuItem key={section.value}>
                        <SidebarMenuButton
                          type="button"
                          isActive={activeSection === section.value}
                          disabled={section.disabled}
                          tooltip={section.label}
                          aria-label={
                            section.badge
                              ? `${section.label} ${section.badge}`
                              : section.label
                          }
                          onClick={() => {
                            if (!section.disabled) {
                              setActiveSection(section.value);
                            }
                          }}
                        >
                          <Icon data-icon="inline-start" />
                          <span>{section.label}</span>
                          {section.badge ? (
                            <span className="ml-auto text-xs text-muted-foreground">
                              {section.badge}
                            </span>
                          ) : null}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter data-testid="app-sidebar-utility">
            <SidebarMenu aria-label="Utility navigation">
              {utilitySections.map((section) => {
                const Icon = section.icon;

                return (
                  <SidebarMenuItem key={section.value}>
                    <SidebarMenuButton
                      type="button"
                      isActive={activeSection === section.value}
                      tooltip={section.label}
                      aria-label={section.label}
                      onClick={() => setActiveSection(section.value)}
                    >
                      <Icon data-icon="inline-start" />
                      <span>{section.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              <SidebarMenuItem>
                <SidebarTrigger className="w-full justify-start gap-2 px-2" />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="min-w-0">
          {notice ? <div className="border-b px-4 py-3">{notice}</div> : null}
          <div className="flex-1 p-0">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </Tabs>
  );
}
