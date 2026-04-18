import { SESSION_MODES, type SessionMode } from "@/client/lib/constants";
import type { FailureKind } from "@/client/lib/classify-failure";
import type { PageAncestor, WorkspaceRole } from "@/shared/types";
import type { PageAccessLevel } from "@/shared/entitlements";
import type { WorkspaceAccessMode } from "@/client/stores/workspace-store";

/** Which surface the active-page model is running under. Canonical pages live
 * inside a resolved workspace; share-token pages do not. */
export type ActivePageSurface = "canonical" | "shared";

export type ActivePageBacking = "live" | "cache" | "seed";
export type ActivePageAccessConfidence = "authoritative" | "optimistic";

export interface ActivePageSnapshot {
  id: string;
  workspaceId: string;
  title: string;
  icon: string | null;
  coverUrl: string | null;
}

export interface ActivePageAccess {
  mode: Exclude<PageAccessLevel, "none">;
  confidence: ActivePageAccessConfidence;
}

export interface ActivePagePatch {
  title?: string;
  icon?: string | null;
  coverUrl?: string | null;
}

/** Why the page is currently unavailable. */
export type UnavailableReason = "offline-miss" | "gone" | "error";

export type ActivePageState =
  | { kind: "loading" }
  | {
      kind: "ready";
      backing: ActivePageBacking;
      snapshot: ActivePageSnapshot;
      access: ActivePageAccess;
      ancestors: PageAncestor[];
      ancestorsStatus: "loading" | "ready";
    }
  | {
      kind: "unavailable";
      reason: UnavailableReason;
      message: string;
    };

/**
 * Action the active-page state machine should take after a load failure.
 *
 * - `evict` clears cached metadata for the page id and emits a terminal
 *   "no access" unavailable (access has been revoked).
 * - `cache-fallback` tries to render from cached metadata + cached doc;
 *   canonical surfaces only.
 * - `terminal-gone` emits a terminal unavailable.
 */
export type PageLoadFailureAction = "evict" | "cache-fallback" | "terminal-gone";

export function getPageLoadFailureAction(
  failureKind: FailureKind,
  online: boolean,
  sessionMode: SessionMode,
  surface: ActivePageSurface,
): PageLoadFailureAction {
  if (failureKind === "forbidden") return "evict";

  if (failureKind === "not-found") return "terminal-gone";

  const offline = !online || sessionMode !== SESSION_MODES.AUTHENTICATED;

  if (failureKind === "network" || offline) {
    return surface === "canonical" ? "cache-fallback" : "terminal-gone";
  }

  return "terminal-gone";
}

export function needsRestrictedAncestors(accessMode: WorkspaceAccessMode | null, role: WorkspaceRole | null): boolean {
  return accessMode === "shared" || role === "guest";
}

export function isActivePageReady(state: ActivePageState): state is Extract<ActivePageState, { kind: "ready" }> {
  return state.kind === "ready";
}
