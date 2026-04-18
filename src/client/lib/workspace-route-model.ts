import type { WorkspaceAccessMode } from "@/client/stores/workspace-store";

/** Data freshness for the resolved workspace route. */
export type WorkspaceRouteSource = "live" | "cache";

/**
 * Resolution state for the `/$workspaceSlug` route. Consumers branch on
 * `phase` and read `workspaceId` / `accessMode` / `cacheStatus` only where
 * the shape below guarantees them.
 *
 * Route state carries identity KEYS only (`workspaceId`, slug). Mutable
 * workspace payload lives in `workspace-store` snapshots; consumers read it
 * via `snapshotsByWorkspaceId[workspaceId]`.
 */
export type WorkspaceRouteState =
  /**
   * Resolving. `workspaceId` is set when a cached snapshot seeded the initial
   * render and is null on a cold start until the first response lands.
   */
  | { phase: "loading"; workspaceId: string | null }
  /**
   * Workspace resolved and usable. `cacheStatus: "live"` means the data came
   * from a successful network round-trip; `"cache"` means we are serving
   * persisted snapshot data while a live refetch may still be in flight.
   */
  | {
      phase: "ready";
      workspaceId: string;
      accessMode: WorkspaceAccessMode;
      cacheStatus: "cache" | "live";
    }
  /**
   * Cached workspace identity exists but live access could not be confirmed
   * (e.g. shared-downgrade probe failed). Page routes can still render from
   * cache via the page-surface; member-only routes (index, settings) are
   * blocked.
   */
  | {
      phase: "degraded";
      workspaceId: string | null;
      workspaceSlug: string;
      reason: "stale-shared";
    }
  /** Terminal failure; the workspace cannot be rendered. */
  | { phase: "error"; errorKind: "not-found" | "network"; message: string };

type ReadyState = Extract<WorkspaceRouteState, { phase: "ready" }>;
type WithWorkspaceId = Exclude<WorkspaceRouteState, { phase: "error" }> & { workspaceId: string };

export function isWorkspaceReady(state: WorkspaceRouteState): state is ReadyState {
  return state.phase === "ready";
}

export function hasWorkspaceIdentity(state: WorkspaceRouteState): state is WithWorkspaceId {
  return state.phase !== "error" && state.workspaceId !== null;
}
