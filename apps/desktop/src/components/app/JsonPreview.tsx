import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

type JsonPreviewProps = {
  value: unknown;
  emptyMessage: string;
  emptyTitle?: string;
  className?: string;
};

export function JsonPreview({
  value,
  emptyMessage,
  emptyTitle = "No data yet",
  className,
}: JsonPreviewProps) {
  if (value == null) {
    return (
      <Empty className={cn("min-h-28 rounded-lg border border-dashed", className)}>
        <EmptyHeader>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyMessage}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <pre
      className={cn(
        "max-h-72 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground",
        className,
      )}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
