const SHARED_INBOX_RETURN_TO_KEY = "blandSharedInboxReturnTo";

export function getSharedInboxReturnTo(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;

  const returnTo = (state as Record<string, unknown>)[SHARED_INBOX_RETURN_TO_KEY];
  if (typeof returnTo !== "string" || !returnTo.startsWith("/")) {
    return null;
  }

  return returnTo;
}

export function withSharedInboxReturnTo(state: unknown, href: string): Record<string, unknown> {
  const base = state && typeof state === "object" ? (state as Record<string, unknown>) : {};
  return { ...base, [SHARED_INBOX_RETURN_TO_KEY]: href };
}
