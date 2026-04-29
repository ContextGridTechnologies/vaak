type JsonPreviewProps = {
  value: unknown;
  emptyMessage: string;
};

export function JsonPreview({ value, emptyMessage }: JsonPreviewProps) {
  if (value == null) {
    return <p className="empty-state">{emptyMessage}</p>;
  }

  return <pre className="code-block">{JSON.stringify(value, null, 2)}</pre>;
}
