import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  SquareTerminalIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
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
import {
  getAppShellPreferences,
  isTauriRuntime,
  saveAppShellPreferences,
} from "@/lib/tauri";
import { appSections, type AppSection } from "./navigation";

type AppLayoutProps = {
  notice?: ReactNode;
  children: ReactNode;
};

const COMPACT_VIEWPORT_MAX_WIDTH = 960;

export function AppLayout({ notice, children }: AppLayoutProps) {
  const [activeSection, setActiveSection] = useState<AppSection>("home");
  const [compactViewport, setCompactViewport] = useState(() =>
    isCompactViewport(),
  );
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

    void getAppShellPreferences()
      .then((preferences) => {
        const preferredOpen = !preferences.sidebarCollapsed;
        setSidebarPreferenceOpen(preferredOpen);
        setSidebarOpen(isCompactViewport() ? false : preferredOpen);
      })
      .catch((error: unknown) => {
        console.error("Failed to load app shell preferences", error);
      });
  }, []);

  const handleSidebarOpenChange = useCallback((open: boolean) => {
    setSidebarPreferenceOpen(open);
    setSidebarOpen(compactViewport ? false : open);

    if (!isTauriRuntime()) {
      return;
    }

    void saveAppShellPreferences({ sidebarCollapsed: !open }).catch(
      (error: unknown) => {
        console.error("Failed to save app shell preferences", error);
      },
    );
  }, [compactViewport]);

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
        className="h-full min-h-full overflow-hidden bg-background text-foreground"
        style={
          {
            "--sidebar-width": "11.75rem",
          } as React.CSSProperties
        }
      >
        <Sidebar
          data-testid="app-sidebar"
          data-collapsible="icon"
          collapsible="icon"
          className="relative"
        >
          <SidebarHeader className="px-3 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg border border-sidebar-border/80 bg-background text-primary shadow-xs">
                <SquareTerminalIcon data-icon="icon" />
              </div>
              <span className="truncate text-[1.35rem] font-semibold tracking-tight text-sidebar-foreground group-data-[collapsible=icon]:group-data-[state=collapsed]:hidden">
                Vaak
              </span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup className="px-2 py-1.5" data-testid="app-sidebar-primary">
              <SidebarGroupContent>
                <SidebarMenu aria-label="Primary navigation" className="gap-1">
                  {appSections.map((section) => {
                    const Icon = section.icon;
                    const isActive = activeSection === section.value;

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
                          className="h-9 rounded-lg px-2.5 pl-4 text-sm font-medium text-sidebar-foreground/84 data-[active=true]:bg-sidebar-accent/80 data-[active=true]:text-sidebar-foreground"
                          onClick={() => setActiveSection(section.value)}
                        >
                          <Icon data-icon="inline-start" />
                          <span>{section.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarDockToggle />
        </Sidebar>
        <SidebarInset className="min-w-0 overflow-hidden">
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
            {children}
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

function SidebarDockToggle() {
  const { open, toggleSidebar } = useSidebar();

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      aria-label="Toggle Sidebar"
      data-testid="app-sidebar-dock-toggle"
      className="absolute right-0 bottom-3 z-10 size-7 translate-x-1/2 rounded-lg border-sidebar-border bg-background shadow-sm"
      onClick={toggleSidebar}
    >
      {open ? <ChevronLeftIcon data-icon="icon" /> : <ChevronRightIcon data-icon="icon" />}
    </Button>
  );
}
