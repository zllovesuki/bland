import { OIDC_RETURN_MARKER, SESSION_HINT_COOKIE } from "@/shared/auth";

const PUBLIC_BOOTSTRAP_PATH_PREFIXES = ["/login", "/s/"] as const;
export type SessionBootstrapStrategy = "skip" | "background" | "block";

export function hasSessionRefreshHint(cookieHeader = typeof document === "undefined" ? "" : document.cookie): boolean {
  return cookieHeader.split(";").some((pair) => {
    const [name, value] = pair.trim().split("=");
    return name === SESSION_HINT_COOKIE && value === "1";
  });
}

function isPublicBootstrapPath(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname === "/login") return true;
  return PUBLIC_BOOTSTRAP_PATH_PREFIXES.some((prefix) =>
    prefix === "/login" ? pathname === prefix : pathname.startsWith(prefix),
  );
}

function isInvitePath(pathname: string): boolean {
  return pathname.startsWith("/invite/");
}

export function hasOidcMarker(search?: string): boolean {
  if (search === undefined) {
    if (typeof window === "undefined") return false;
    search = window.location.search;
  }
  if (!search) return false;
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).has(OIDC_RETURN_MARKER);
}

export function stripOidcMarker(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (!params.has(OIDC_RETURN_MARKER)) return;
  params.delete(OIDC_RETURN_MARKER);
  const next = params.toString();
  const url = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`;
  window.history.replaceState(window.history.state, "", url);
}

export interface PostOidcBootstrapDeps {
  refreshSession: () => Promise<{ ok: boolean }>;
  clearAuth: () => void;
  navigate: (url: string) => void;
}

// ADR: post-OIDC refresh failure must fail closed. The cached user may belong
// to a prior identity; rendering before the fresh bland JWT is confirmed would
// leak stale workspace/Dexie data for the old user.
export async function performBootstrapRefresh(
  postOidcReturn: boolean,
  deps: PostOidcBootstrapDeps,
): Promise<"continue" | "redirected"> {
  const result = await deps.refreshSession();
  if (postOidcReturn && !result.ok) {
    deps.clearAuth();
    stripOidcMarker();
    deps.navigate("/login?error=oidc_post_callback_refresh_failed");
    return "redirected";
  }
  stripOidcMarker();
  return "continue";
}

export function getSessionBootstrapStrategy(
  pathname: string,
  hasStoredUser: boolean,
  cookieHeader?: string,
  search?: string,
): SessionBootstrapStrategy {
  // ADR: post-OIDC redirects carry the marker so the SPA blocks on refresh +
  // owner validation. A prior cached user from a different identity must never
  // render before the freshly-minted bland JWT is exchanged.
  if (hasOidcMarker(search)) return "block";

  if (hasStoredUser) return "background";

  if (!hasSessionRefreshHint(cookieHeader)) {
    return "skip";
  }

  // Invite acceptance triggers a write the moment the SPA mounts; refresh
  // must complete before the auto-accept fires.
  if (isInvitePath(pathname)) return "block";

  return isPublicBootstrapPath(pathname) ? "background" : "block";
}
