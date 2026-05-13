import { cn } from "@/lib/utils";

type OnboardingProgressHeaderProps = {
  step: number;
  totalSteps: number;
  title: string;
  description?: string;
  className?: string;
};

export function OnboardingProgressHeader({
  step,
  totalSteps,
  title,
  description,
  className,
}: OnboardingProgressHeaderProps) {
  return (
    <header
      className={cn(
        "mx-auto flex w-full max-w-2xl flex-col items-center gap-4 text-center",
        className,
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
        VAAK SETUP
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
        <span>{`Step ${step} of ${totalSteps}`}</span>
        <div
          className="flex items-center gap-2"
          aria-hidden="true"
          data-testid="onboarding-progress"
        >
          {Array.from({ length: totalSteps }, (_, index) => {
            const active = index < step;

            return (
              <span
                key={index}
                data-testid="onboarding-progress-segment"
                data-state={active ? "active" : "pending"}
                className={cn(
                  "h-1.5 w-8 rounded-full transition-colors sm:w-10",
                  active ? "bg-primary" : "bg-border",
                )}
              />
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-balance text-2xl font-semibold leading-tight text-foreground sm:text-3xl lg:text-[2.65rem]">
          {title}
        </h1>
        {description ? (
          <p className="mx-auto max-w-xl text-balance text-sm text-muted-foreground sm:text-[0.95rem]">
            {description}
          </p>
        ) : null}
      </div>
    </header>
  );
}
