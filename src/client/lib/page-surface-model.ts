import { SESSION_MODES, type SessionMode } from "@/client/lib/constants";
import type { FailureKind } from "@/client/lib/classify-failure";
import type { Page, AncestorInfo, WorkspaceRole } from "@/shared/types";
import type { WorkspaceAccessMode } from "@/client/stores/workspace-store";

/** Which surface the page-surface model is running under. Canonical pages
 * live inside a resolved workspace; share-token pages do not. */
export type PageSurfaceKind = "canonical" | "share";

/** Why the page is currently unavailable. */
export type UnavailableReason = "offline-miss" | "gone" | "error";

/**
 * Render state for a single active page. The `ready` variant is the only one
 * that carries `page` / `ancestors`. The `unavailable` variant carries a
 * `reason` for the cause so consumers can distinguish offline misses,
 * definitive losses, and transient errors.
 */
export type PageSurfaceState =
  | { kind: "loading" }
  | {
      kind: "ready";
      source: "live" | "cache";
      page: Page & { can_edit?: boolean };
      ancestors: AncestorInfo[];
      ancestorsStatus: "loading" | "ready";
    }
  | {
      kind: "unavailable";
      reason: UnavailableReason;
      message: string;
    };

/**
 * Action the page-surface should take after a load failure. Drives the
 * provider's side-effect choice (clear cache vs render cache vs go
 * terminal). The resulting state is always shaped as a variant of
 * `PageSurfaceState`.
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
  surface: PageSurfaceKind,
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
