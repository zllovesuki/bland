import { SESSION_MODES, type SessionMode } from "@/client/lib/constants";
import { isWorkspaceReady, type WorkspaceRouteState } from "@/client/lib/workspace-route-model";
import type { Page } from "@/shared/types";

export type PageLoadTarget = "live" | "cached-page" | "offline-unavailable" | "cache-unavailable";

interface PageLoadTargetInput {
  route: WorkspaceRouteState;
  online: boolean;
  sessionMode: SessionMode;
  cachedPage: Page | null;
  docCached: boolean;
  workspaceId: string | null;
}

/**
 * Decide what to render for the active page. Returns `null` to signal
 * "wait" — workspace identity is still resolving; no load attempt should
 * fire yet.
 */
export function getPageLoadTarget(input: PageLoadTargetInput): PageLoadTarget | null {
  if (!input.online || input.sessionMode !== SESSION_MODES.AUTHENTICATED) {
    if (input.cachedPage && input.docCached) return "cached-page";
    return "offline-unavailable";
  }
  if (input.route.phase === "degraded") {
    if (input.cachedPage && input.docCached) return "cached-page";
    return "cache-unavailable";
  }
  if (!input.workspaceId || !isWorkspaceReady(input.route)) {
    return null;
  }
  return "live";
}
