import type { HTMLAttributes, ReactNode } from "react";
import { classNames } from "../../lib/classNames";

type AlertVariant = "info" | "success" | "warning" | "error";

type AlertProps = HTMLAttributes<HTMLDivElement> & {
  title?: string;
  variant?: AlertVariant;
  children: ReactNode;
};

export function Alert({
  title,
  variant = "info",
  className,
  children,
  ...props
}: AlertProps) {
  return (
    <div
      className={classNames("alert", `alert--${variant}`, className)}
      {...props}
    >
      {title && <strong className="alert__title">{title}</strong>}
      <div>{children}</div>
    </div>
  );
}
