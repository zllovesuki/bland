import { SESSION_MODES, type SessionMode } from "@/client/lib/constants";
import type { ActivePageSurface } from "@/client/lib/active-page-model";
import { isWorkspaceReady, type WorkspaceRouteState } from "@/client/lib/workspace-route-model";
import type { Page } from "@/shared/types";

export type PageLoadTarget = "live" | "cached-page" | "offline-unavailable" | "cache-unavailable";

interface PageLoadTargetInput {
  surface: ActivePageSurface;
  workspaceId: string | null;
  online: boolean;
  sessionMode: SessionMode;
  cachedPage: Page | null;
  docCached: boolean;
  route: WorkspaceRouteState | null;
}

/**
 * Decide what to render for the active page. Returns `null` to signal
 * "wait" — workspace identity is still resolving; no load attempt should
 * fire yet.
 */
export function getPageLoadTarget(input: PageLoadTargetInput): PageLoadTarget | null {
  if (input.surface === "shared") {
    return input.workspaceId ? "live" : null;
  }
  if (!input.online || input.sessionMode !== SESSION_MODES.AUTHENTICATED) {
    if (input.cachedPage && input.docCached) return "cached-page";
    return "offline-unavailable";
  }
  const route = input.route;
  if (!route) return null;
  if (route.phase === "degraded") {
    if (input.cachedPage && input.docCached) return "cached-page";
    return "cache-unavailable";
  }
  if (!input.workspaceId || !isWorkspaceReady(route)) {
    return null;
  }
  return "live";
}
