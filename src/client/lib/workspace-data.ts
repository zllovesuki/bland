import { api } from "@/client/lib/api";
import type { Page, Workspace, WorkspaceMember } from "@/shared/types";
import type { WorkspaceAccessMode, WorkspaceRouteSource, WorkspaceSnapshot } from "@/client/stores/workspace-store";

/**
 * Returns true only when the server definitively rejected page access.
 * Uses allowlist semantics -- only the specific error codes returned by
 * GET /pages/:id/context for real page-level misses count. Everything else
 * (rate limits, 500s, auth transport failures) falls through to cache.
 */
function isDefinitiveServerRejection(err: unknown): boolean {
  if (err == null || typeof err !== "object" || !("error" in err)) {
    return false;
  }
  const code = (err as { error: string }).error;
  return code === "not_found" || code === "forbidden";
}

export interface ResolvedWorkspace {
  workspaceId: string;
  workspace: Workspace;
  accessMode: WorkspaceAccessMode;
  source: WorkspaceRouteSource;
  pages: Page[];
  members: WorkspaceMember[];
  canonicalSlug?: string;
}

export type ResolvedResult =
  | { kind: "resolved"; source: "live" | "cache"; data: ResolvedWorkspace; liveWorkspaces?: Workspace[] }
  | { kind: "not_found"; liveWorkspaces?: Workspace[] }
  | { kind: "unavailable" };

interface CacheRead {
  memberWorkspaces: Workspace[];
  snapshotsByWorkspaceId: Record<string, WorkspaceSnapshot>;
  activeAccessMode: WorkspaceAccessMode | null;
}

async function fetchWorkspaceData(
  workspaceId: string,
  accessMode: WorkspaceAccessMode,
): Promise<{ pages: Page[]; members: WorkspaceMember[] }> {
  if (accessMode === "shared") {
    const pages = await api.pages.list(workspaceId);
    return { pages, members: [] };
  }
  const [pages, members] = await Promise.all([api.pages.list(workspaceId), api.workspaces.members(workspaceId)]);
  return { pages, members };
}

/**
 * Resolve workspace context for the `/$workspaceSlug` route.
 *
 * This only resolves member workspaces. If the slug is not in the member
 * workspace list, it returns `unavailable` (NOT `not_found`) so that child
 * page routes can still attempt resolution via `api.pages.context` for
 * shared-access workspaces.
 */
export async function resolveWorkspaceRoute(slug: string, cache: CacheRead): Promise<ResolvedResult> {
  let workspaces = cache.memberWorkspaces;
  let liveWorkspaces: Workspace[] | undefined;

  try {
    workspaces = await api.workspaces.list();
    liveWorkspaces = workspaces;
  } catch {
    // Fall back to cached list
  }

  const workspace = workspaces.find((w) => w.slug === slug);
  if (!workspace) {
    // Slug not in member workspace list. Check cached snapshot (may be shared).
    const snap = Object.values(cache.snapshotsByWorkspaceId).find((s) => s.workspace.slug === slug);
    if (snap) {
      return {
        kind: "resolved",
        source: "cache",
        liveWorkspaces,
        data: {
          workspaceId: snap.workspace.id,
          workspace: snap.workspace,
          accessMode: snap.accessMode,
          source: "cache",
          pages: snap.pages,
          members: snap.members,
        },
      };
    }
    // Return unavailable -- NOT not_found. Child page routes may still resolve
    // via api.pages.context for shared-access workspaces. The only caller that
    // should treat this as "redirect to /" is the workspace index route, not
    // the page route.
    if (liveWorkspaces) {
      return { kind: "unavailable", liveWorkspaces } as ResolvedResult;
    }
    return { kind: "unavailable" };
  }

  try {
    const { pages, members } = await fetchWorkspaceData(workspace.id, "member");
    return {
      kind: "resolved",
      source: liveWorkspaces ? "live" : "cache",
      liveWorkspaces,
      data: {
        workspaceId: workspace.id,
        workspace,
        accessMode: "member",
        source: liveWorkspaces ? "live" : "cache",
        pages,
        members,
      },
    };
  } catch {
    // Bootstrap failed but we still have the workspace identity
    const snap = cache.snapshotsByWorkspaceId[workspace.id];
    return {
      kind: "resolved",
      source: "cache",
      liveWorkspaces,
      data: {
        workspaceId: workspace.id,
        workspace,
        accessMode: snap?.accessMode ?? "member",
        source: "cache",
        pages: snap?.pages ?? [],
        members: snap?.members ?? [],
      },
    };
  }
}

/**
 * Resolve page context for the `/$workspaceSlug/$pageId` route.
 *
 * Always calls api.pages.context when online to validate page access and
 * canonicalize the workspace slug. Falls back to cached snapshot only when
 * the API call fails (offline/error).
 */
export async function resolvePageRoute(
  workspaceSlug: string,
  pageId: string,
  cache: CacheRead,
): Promise<ResolvedResult> {
  // Always resolve via page context API for correctness -- validates page
  // belongs to the workspace and enables slug canonicalization.
  try {
    const ctx = await api.pages.context(pageId);
    const { pages, members } = await fetchWorkspaceData(ctx.workspace.id, ctx.viewer.access_mode);
    return {
      kind: "resolved",
      source: "live",
      data: {
        workspaceId: ctx.workspace.id,
        workspace: ctx.workspace,
        accessMode: ctx.viewer.access_mode,
        source: "live",
        pages,
        members,
        canonicalSlug: ctx.workspace.slug !== workspaceSlug ? ctx.workspace.slug : undefined,
      },
    };
  } catch (err) {
    // Server definitively rejected (403 forbidden, 404 not found) -- page is
    // not accessible. Return not_found so the route redirects.
    if (isDefinitiveServerRejection(err)) {
      return { kind: "not_found" };
    }

    // Network/transport error -- try cache fallback
    const snap = Object.values(cache.snapshotsByWorkspaceId).find((s) => s.workspace.slug === workspaceSlug);
    if (snap) {
      return {
        kind: "resolved",
        source: "cache",
        data: {
          workspaceId: snap.workspace.id,
          workspace: snap.workspace,
          accessMode: snap.accessMode,
          source: "cache",
          pages: snap.pages,
          members: snap.members,
        },
      };
    }
    return { kind: "unavailable" };
  }
}

interface StoreApply {
  setMemberWorkspaces(ws: Workspace[]): void;
  replaceWorkspaceSnapshot(workspaceId: string, snapshot: WorkspaceSnapshot): void;
  setActiveRoute(workspaceId: string, accessMode: WorkspaceAccessMode, source: WorkspaceRouteSource): void;
  clearActiveRoute(): void;
  setLastVisitedWorkspaceId(id: string | null): void;
}

export function applyResolvedRoute(store: StoreApply, result: ResolvedResult): void {
  if (result.kind === "resolved") {
    const { data, liveWorkspaces } = result;
    if (liveWorkspaces) {
      store.setMemberWorkspaces(liveWorkspaces);
    }
    store.replaceWorkspaceSnapshot(data.workspaceId, {
      workspace: data.workspace,
      accessMode: data.accessMode,
      pages: data.pages,
      members: data.members,
    });
    store.setActiveRoute(data.workspaceId, data.accessMode, data.source);
    store.setLastVisitedWorkspaceId(data.workspaceId);
  } else {
    const liveWorkspaces = "liveWorkspaces" in result ? result.liveWorkspaces : undefined;
    if (liveWorkspaces) {
      store.setMemberWorkspaces(liveWorkspaces);
    }
    // Don't clear active route for unavailable -- the child page route may
    // still resolve. Only clear on explicit not_found.
    if (result.kind === "not_found") {
      store.clearActiveRoute();
    }
  }
}
