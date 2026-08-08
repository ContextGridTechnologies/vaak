import type { ReactNode, Ref } from "react";

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
  titleLevel?: 1 | 2;
  titleRef?: Ref<HTMLHeadingElement>;
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
  titleLevel = 2,
  titleRef,
  description,
  actions,
  children,
  footer,
  className,
  contentClassName,
  footerClassName,
}: SectionPanelProps) {
  const Title = titleLevel === 1 ? "h1" : "h2";

  return (
    <Card size="sm" className={cn("rounded-lg shadow-none", className)}>
      <CardHeader>
        <CardTitle>
          <Title ref={titleRef} tabIndex={titleRef ? -1 : undefined}>
            {title}
          </Title>
        </CardTitle>
        {description ? (
          <CardDescription>{description}</CardDescription>
        ) : null}
        {actions ? <CardAction>{actions}</CardAction> : null}
      </CardHeader>
      <CardContent className={cn("flex flex-col gap-2.5", contentClassName)}>
        {children}
      </CardContent>
      {footer ? <CardFooter className={footerClassName}>{footer}</CardFooter> : null}
    </Card>
  );
}
