import type { ReactNode } from "react";
import { classNames } from "../../lib/classNames";

type StatusTone = "idle" | "recording" | "stopped" | "error";

type StatusPillProps = {
  tone: StatusTone;
  children: ReactNode;
};

export function StatusPill({ tone, children }: StatusPillProps) {
  return (
    <span className={classNames("status-pill", `status-pill--${tone}`)}>
      {children}
    </span>
  );
}
