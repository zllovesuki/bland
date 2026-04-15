import { SESSION_HINT_COOKIE } from "@/shared/auth";

const PUBLIC_BOOTSTRAP_PATH_PREFIXES = ["/login", "/invite/", "/s/"] as const;

export function hasSessionRefreshHint(cookieHeader = typeof document === "undefined" ? "" : document.cookie): boolean {
  return cookieHeader.split(";").some((pair) => {
    const [name, value] = pair.trim().split("=");
    return name === SESSION_HINT_COOKIE && value === "1";
  });
}

export function shouldBootstrapSession(pathname: string, hasStoredUser: boolean, cookieHeader?: string): boolean {
  if (hasStoredUser || hasSessionRefreshHint(cookieHeader)) {
    return true;
  }

  if (pathname === "/") {
    return false;
  }

  return !PUBLIC_BOOTSTRAP_PATH_PREFIXES.some((prefix) =>
    prefix === "/login" ? pathname === prefix : pathname.startsWith(prefix),
  );
}
