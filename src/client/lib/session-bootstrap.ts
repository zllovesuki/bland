import { SESSION_HINT_COOKIE } from "@/shared/auth";

const PUBLIC_BOOTSTRAP_PATH_PREFIXES = ["/login", "/invite/", "/s/"] as const;
export type SessionBootstrapStrategy = "skip" | "background" | "block";

export function hasSessionRefreshHint(cookieHeader = typeof document === "undefined" ? "" : document.cookie): boolean {
  return cookieHeader.split(";").some((pair) => {
    const [name, value] = pair.trim().split("=");
    return name === SESSION_HINT_COOKIE && value === "1";
  });
}

function isPublicBootstrapPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_BOOTSTRAP_PATH_PREFIXES.some((prefix) =>
    prefix === "/login" ? pathname === prefix : pathname.startsWith(prefix),
  );
}

export function getSessionBootstrapStrategy(
  pathname: string,
  hasStoredUser: boolean,
  cookieHeader?: string,
): SessionBootstrapStrategy {
  if (hasStoredUser) return "background";

  if (!hasSessionRefreshHint(cookieHeader)) {
    return "skip";
  }

  return isPublicBootstrapPath(pathname) ? "background" : "block";
}
