import type { ReactNode } from "react";

type PageShellProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  notice?: ReactNode;
  children: ReactNode;
};

export function PageShell({
  eyebrow,
  title,
  subtitle,
  notice,
  children,
}: PageShellProps) {
  return (
    <main className="page-shell">
      <header className="page-shell__hero">
        {eyebrow && <p className="page-shell__eyebrow">{eyebrow}</p>}
        <h1 className="page-shell__title">{title}</h1>
        {subtitle && <p className="page-shell__subtitle">{subtitle}</p>}
        {notice && <div className="page-shell__notice">{notice}</div>}
      </header>
      <div className="page-shell__content">{children}</div>
    </main>
  );
}
