import type { HTMLAttributes, ReactNode } from "react";
import { classNames } from "../../lib/classNames";

type PanelProps = HTMLAttributes<HTMLElement> & {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function Panel({
  title,
  description,
  actions,
  className,
  children,
  ...props
}: PanelProps) {
  return (
    <section className={classNames("panel", className)} {...props}>
      <div className="panel__header">
        <div className="panel__titles">
          <h2 className="panel__title">{title}</h2>
          {description && <p className="panel__description">{description}</p>}
        </div>
        {actions && <div className="panel__actions">{actions}</div>}
      </div>
      <div className="panel__body">{children}</div>
    </section>
  );
}
