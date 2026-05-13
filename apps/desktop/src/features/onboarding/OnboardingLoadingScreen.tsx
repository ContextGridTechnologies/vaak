import { appScreenContentClassName } from "@/components/app";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

export function OnboardingLoadingScreen() {
  return (
    <div className="h-full min-h-0 bg-background text-foreground">
      <ScrollArea
        data-testid="onboarding-scroll-region"
        className="h-full"
      >
        <main
          data-testid="app-screen-content"
          className={appScreenContentClassName}
        >
          <Skeleton className="h-24 w-full" />
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-56" />
            <Skeleton className="h-56" />
            <Skeleton className="h-56" />
          </div>
        </main>
      </ScrollArea>
    </div>
  );
}
