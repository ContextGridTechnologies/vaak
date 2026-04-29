import type { ButtonHTMLAttributes } from "react";
import { classNames } from "../../lib/classNames";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  block?: boolean;
};

export function Button({
  variant = "primary",
  block = false,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={classNames(
        "button",
        `button--${variant}`,
        block && "button--block",
        className,
      )}
      {...props}
    />
  );
}
