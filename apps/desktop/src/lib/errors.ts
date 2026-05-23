export function normalizeError(err: unknown): string {
  if (typeof err === "string") {
    return err;
  }

  if (err && typeof err === "object") {
    const maybeMessage = (err as { message?: string }).message;
    const maybeCode = (err as { code?: string }).code;
    const maybeRetryAfterMs = (err as { retryAfterMs?: number }).retryAfterMs;
    const retrySuffix =
      typeof maybeRetryAfterMs === "number" && maybeRetryAfterMs > 0
        ? ` Try again in ${formatRetryAfter(maybeRetryAfterMs)}.`
        : "";

    if (maybeCode && maybeMessage) {
      return `${maybeCode}: ${maybeMessage}${retrySuffix}`;
    }

    if (maybeMessage) {
      return `${maybeMessage}${retrySuffix}`;
    }
  }

  return "Unknown error";
}

function formatRetryAfter(retryAfterMs: number): string {
  const seconds = Math.ceil(retryAfterMs / 1000);
  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }

  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
