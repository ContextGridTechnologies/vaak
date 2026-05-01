import { appScreenContentClassName } from "@/components/app";
import { Skeleton } from "@/components/ui/skeleton";

export function OnboardingLoadingScreen() {
  return (
    <div className="min-h-full bg-background text-foreground">
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
    </div>
  );
}
