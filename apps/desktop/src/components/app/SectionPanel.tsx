import type { ReactNode } from "react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SectionPanelProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
  footerClassName?: string;
};

export function SectionPanel({
  title,
  description,
  actions,
  children,
  footer,
  className,
  contentClassName,
  footerClassName,
}: SectionPanelProps) {
  return (
    <Card className={cn("rounded-lg shadow-none", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? (
          <CardDescription>{description}</CardDescription>
        ) : null}
        {actions ? <CardAction>{actions}</CardAction> : null}
      </CardHeader>
      <CardContent className={cn("flex flex-col gap-3", contentClassName)}>
        {children}
      </CardContent>
      {footer ? <CardFooter className={footerClassName}>{footer}</CardFooter> : null}
    </Card>
  );
}
