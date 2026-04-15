export const STORAGE_KEYS = {
  D1_BOOKMARK: "bland:d1:bookmark",
  USER: "bland:user",
  WORKSPACE: "bland:workspace",
  LAYOUT: "bland:layout",
  SIDEBAR: "bland:sidebar",
  CACHED_DOCS: "bland:cached-docs",
} as const;

export const SECURITY_VERIFICATION_UNAVAILABLE_MESSAGE =
  "Security verification is unavailable right now. Please try again.";

export const SESSION_MODES = {
  RESTORING: "restoring",
  AUTHENTICATED: "authenticated",
  LOCAL_ONLY: "local-only",
  EXPIRED: "expired",
  ANONYMOUS: "anonymous",
} as const;

export type SessionMode = (typeof SESSION_MODES)[keyof typeof SESSION_MODES];

export function getCachedDocKey(pageId: string): string {
  return `bland:doc:${pageId}`;
}
