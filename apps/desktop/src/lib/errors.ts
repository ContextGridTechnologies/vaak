export function normalizeError(err: unknown): string {
  if (typeof err === "string") {
    return err;
  }

  if (err && typeof err === "object") {
    const maybeMessage = (err as { message?: string }).message;
    const maybeCode = (err as { code?: string }).code;

    if (maybeCode && maybeMessage) {
      return `${maybeCode}: ${maybeMessage}`;
    }

    if (maybeMessage) {
      return maybeMessage;
    }
  }

  return "Unknown error";
}
