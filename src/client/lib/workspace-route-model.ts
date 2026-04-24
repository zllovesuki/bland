import type { WorkspaceAccessMode } from "@/client/stores/workspace-replica";

/**
 * Resolution state for the `/$workspaceSlug` route. Consumers branch on
 * `phase` and read `workspaceId` / `accessMode` only where the shape below
 * guarantees them.
 *
 * Route state carries identity KEYS only (`workspaceId`, slug). Mutable
 * workspace payload lives in the replica projection; consumers read it via
 * `useWorkspaceReplica(workspaceId)` (and siblings). Cache-vs-live is a
 * provider-internal concern used to gate revalidation, not part of the
 * public state.
 */
export type WorkspaceRouteState =
  /**
   * Resolving. `workspaceId` is set when a cached snapshot seeded the initial
   * render and is null on a cold start until the first response lands.
   */
  | { phase: "loading"; workspaceId: string | null }
  /** Workspace resolved and usable. */
  | {
      phase: "ready";
      workspaceId: string;
      accessMode: WorkspaceAccessMode;
    }
  /**
   * Cached workspace identity exists but live access could not be confirmed
   * (e.g. shared-downgrade probe failed). Page routes can still render from
   * cache via the active-page boundary; member-only routes (index, settings) are
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

/**
 * Shell chrome is still resolving identity — render a skeleton sidebar.
 * True for `loading` (no workspace yet) and `degraded` (stale-shared probe
 * produced partial identity). Consumers outside this module should use this
 * helper instead of checking `phase === "degraded"` directly so that route
 * shape changes stay local.
 */
export function isResolvingWorkspace(state: WorkspaceRouteState): boolean {
  return state.phase === "loading" || state.phase === "degraded";
}
