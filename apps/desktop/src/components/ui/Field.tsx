import type { ReactNode } from "react";
import { classNames } from "../../lib/classNames";

type FieldProps = {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
};

export function Field({ label, hint, className, children }: FieldProps) {
  return (
    <label className={classNames("field", className)}>
      <span className="field__label">{label}</span>
      {hint && <span className="field__hint">{hint}</span>}
      <div className="field__control">{children}</div>
    </label>
  );
}
