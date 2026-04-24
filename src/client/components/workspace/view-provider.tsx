import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/client/lib/api";
import { classifyFailure } from "@/client/lib/classify-failure";
import { createRequestGuard } from "@/client/lib/request-guard";
import { SESSION_MODES } from "@/client/lib/constants";
import { type WorkspaceRouteState, isWorkspaceReady, hasWorkspaceIdentity } from "@/client/lib/workspace-route-model";
import { useAuthStore } from "@/client/stores/auth-store";
import { waitForWorkspaceLocalHydration } from "@/client/stores/bootstrap";
import {
  useWorkspaceReplicaStore,
  selectReplicaBySlug,
  selectWorkspaceByPageId,
  selectWorkspaceReplica,
  type WorkspaceAccessMode,
} from "@/client/stores/workspace-replica";
import { replicaCommands } from "@/client/stores/db/workspace-replica";
import { useWorkspaceDirectoryStore, selectWorkspaceBySlug } from "@/client/stores/workspace-directory";
import { directoryCommands } from "@/client/stores/db/workspace-directory";
import { useWorkspaceNavigationStore, selectLastVisitedWorkspaceId } from "@/client/stores/workspace-navigation";
import { navigationCommands } from "@/client/stores/db/workspace-navigation";
import { useOnline } from "@/client/hooks/use-online";
import { WorkspaceViewCtx, type WorkspaceViewContext } from "./use-workspace-view";
import type { Page, WorkspaceMember, WorkspaceMembershipSummary } from "@/shared/types";

function seedFromCache(workspaceSlug: string, pageId: string | null): WorkspaceRouteState {
  const directory = useWorkspaceDirectoryStore.getState();
  const replica = useWorkspaceReplicaStore.getState();

  const memberWs = selectWorkspaceBySlug(directory, workspaceSlug);
  if (memberWs) {
    const replicaRow = selectWorkspaceReplica(replica, memberWs.id);
    if (replicaRow) {
      return { phase: "ready", workspaceId: memberWs.id, accessMode: replicaRow.accessMode };
    }
    return { phase: "loading", workspaceId: memberWs.id };
  }

  const bySlug = selectReplicaBySlug(replica, workspaceSlug);
  if (bySlug) {
    return { phase: "ready", workspaceId: bySlug.id, accessMode: bySlug.accessMode };
  }

  if (pageId) {
    const pageWorkspaceId = selectWorkspaceByPageId(replica, pageId);
    if (pageWorkspaceId) {
      const replicaRow = selectWorkspaceReplica(replica, pageWorkspaceId);
      if (replicaRow) {
        return { phase: "ready", workspaceId: pageWorkspaceId, accessMode: replicaRow.accessMode };
      }
      return { phase: "loading", workspaceId: pageWorkspaceId };
    }
  }

  return { phase: "loading", workspaceId: null };
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

interface WorkspaceViewProviderProps {
  workspaceSlug: string;
  pageId: string | null;
  children: ReactNode;
}

/**
 * Resolves the workspace identity for `/$workspaceSlug` and `/$workspaceSlug/$pageId`.
 *
 * - Page routes (pageId present) use `api.pages.context(pageId)` first when
 *   online + authenticated. The slug is decorative; canonical correction
 *   redirects mismatched slugs to their authoritative form.
 * - Shell routes and offline page routes use slug-first via
 *   `api.workspaces.list`, with a shared-downgrade probe via `api.pages.list`
 *   when the slug is no longer in member scope.
 * - Once `route.phase === "ready"`, we do not re-resolve on page navigation
 *   within the same workspace (the active-page boundary handles per-page loads).
 */
export function WorkspaceViewProvider({ workspaceSlug, pageId, children }: WorkspaceViewProviderProps) {
  const [route, setRoute] = useState<WorkspaceRouteState>(() => seedFromCache(workspaceSlug, pageId));
  const [canonicalSlug, setCanonicalSlug] = useState<string | undefined>();

  const epochRef = useRef(0);
  const activeRef = useRef(true);

  // Tracks data freshness for the revalidation-skip optimization below.
  // Private to this provider; not surfaced on WorkspaceRouteState. Seeded as
  // "cache" because a cache-seeded ready state is the only way initial mount
  // can produce ready — cold-start produces loading.
  const cacheStatusRef = useRef<"cache" | "live">("cache");

  const sessionMode = useAuthStore((s) => s.sessionMode);
  const online = useOnline();
  const previousNetworkStateRef = useRef({ online, sessionMode });

  const routeRef = useRef(route);
  routeRef.current = route;

  // Last-visited writes are gated on membership-axis access (accessMode
  // "member"). Shared-surface visits do not pollute the root-gateway redirect
  // target or the per-workspace last-visited-page map.
  const readyMemberWorkspaceId = route.phase === "ready" && route.accessMode === "member" ? route.workspaceId : null;

  useEffect(() => {
    if (!readyMemberWorkspaceId) return;
    const current = selectLastVisitedWorkspaceId(useWorkspaceNavigationStore.getState());
    if (current !== readyMemberWorkspaceId) {
      void navigationCommands.setLastVisitedWorkspaceId(readyMemberWorkspaceId);
    }
  }, [readyMemberWorkspaceId]);

  useEffect(() => {
    if (!readyMemberWorkspaceId || !pageId) return;
    void navigationCommands.setLastVisitedPage(readyMemberWorkspaceId, pageId);
  }, [readyMemberWorkspaceId, pageId]);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  useEffect(() => {
    const currentRoute = routeRef.current;
    const regainedLiveSession =
      online &&
      sessionMode === SESSION_MODES.AUTHENTICATED &&
      (!previousNetworkStateRef.current.online ||
        previousNetworkStateRef.current.sessionMode !== SESSION_MODES.AUTHENTICATED);
    previousNetworkStateRef.current = { online, sessionMode };

    // Only skip when this workspace has already been confirmed live.
    // Cache-seeded routes still need one online revalidation pass.
    if (!regainedLiveSession && isWorkspaceReady(currentRoute) && cacheStatusRef.current === "live") {
      if (!online) return;
      if (!pageId) return;
      const replica = useWorkspaceReplicaStore.getState();
      const cachedPages = replica.pagesByWorkspaceId.get(currentRoute.workspaceId) ?? [];
      if (cachedPages.some((p) => p.id === pageId)) return;
    }

    const request = createRequestGuard(epochRef, activeRef);

    async function resolve() {
      // Settle any router-driven rehydrate before trusting the seed. In-app
      // transitions from a non-local path (`/login`, `/s/$token`) can land
      // here with empty projections; waiting lets us re-derive identity from
      // the cache before fallback branches declare a terminal error.
      await waitForWorkspaceLocalHydration();
      if (!request.isCurrent()) return;
      if (!isWorkspaceReady(routeRef.current)) {
        setRoute(seedFromCache(workspaceSlug, pageId));
      }

      // Page-route resolver: pages.context-first when online + authenticated.
      // Bootstraps workspace identity from a single authoritative call,
      // sidestepping slug->workspace resolution entirely.
      if (pageId && online && sessionMode === SESSION_MODES.AUTHENTICATED) {
        try {
          const ctx = await api.pages.context(pageId);
          if (!request.isCurrent()) return;

          const accessMode = ctx.viewer.access_mode as WorkspaceAccessMode;
          const workspaceRole = ctx.viewer.workspace_role;
          const { pages, members } = await fetchWorkspaceData(ctx.workspace.id, accessMode);
          if (!request.isCurrent()) return;

          await replicaCommands.replaceWorkspace({
            workspace: ctx.workspace,
            accessMode,
            workspaceRole,
            pages,
            members,
          });
          // `accessMode === "member"` implies membership row exists, which means
          // `workspace_role` is non-null. `directoryCommands.upsert` requires role,
          // so we derive the membership summary here.
          if (accessMode === "member" && workspaceRole !== null) {
            await directoryCommands.upsert({ ...ctx.workspace, role: workspaceRole });
          }
          // Last-visited writes are handled by the readyMemberWorkspaceId effect
          // above so shared-surface visits do not pollute the cache.

          cacheStatusRef.current = "live";
          setRoute({ phase: "ready", workspaceId: ctx.workspace.id, accessMode });
          setCanonicalSlug(ctx.workspace.slug !== workspaceSlug ? ctx.workspace.slug : undefined);
        } catch (err) {
          if (!request.isCurrent()) return;
          const failure = classifyFailure(err, { online: navigator.onLine });
          if (failure === "forbidden" || failure === "not-found") {
            setRoute({ phase: "error", errorKind: "not-found", message: "Page not found" });
          } else {
            setRoute((prev) => {
              if (isWorkspaceReady(prev) || prev.phase === "degraded") return prev;
              const cachedWsId = hasWorkspaceIdentity(prev) ? prev.workspaceId : null;
              return cachedWsId
                ? { phase: "degraded", workspaceId: cachedWsId, workspaceSlug, reason: "stale-shared" }
                : { phase: "error", errorKind: "network", message: "Failed to load workspace" };
            });
          }
        }
        return;
      }

      // Shell route or offline page route: slug-first.
      let workspaces: WorkspaceMembershipSummary[];
      try {
        workspaces = await api.workspaces.list();
      } catch {
        if (!request.isCurrent()) return;
        setRoute((prev) => {
          if (isWorkspaceReady(prev) || prev.phase === "degraded") return prev;
          return { phase: "error", errorKind: "network", message: "Failed to load workspace" };
        });
        return;
      }

      if (!request.isCurrent()) return;
      await directoryCommands.replaceAll(workspaces);

      const ws = workspaces.find((w) => w.slug === workspaceSlug);
      if (ws) {
        try {
          const { pages, members } = await fetchWorkspaceData(ws.id, "member");
          if (!request.isCurrent()) return;
          // Guests stay on `accessMode: "member"` (they have a membership row),
          // but carry `workspaceRole: "guest"` so role-aware affordances keep
          // create/invite/AI hidden. This is the slug-first guest-lie fix.
          await replicaCommands.replaceWorkspace({
            workspace: ws,
            accessMode: "member",
            workspaceRole: ws.role,
            pages,
            members,
          });
          cacheStatusRef.current = "live";
          setRoute({ phase: "ready", workspaceId: ws.id, accessMode: "member" });
        } catch {
          if (!request.isCurrent()) return;
          const replica = useWorkspaceReplicaStore.getState();
          const replicaRow = selectWorkspaceReplica(replica, ws.id);
          if (replicaRow) {
            cacheStatusRef.current = "cache";
            setRoute({ phase: "ready", workspaceId: ws.id, accessMode: replicaRow.accessMode });
          } else {
            setRoute({ phase: "error", errorKind: "network", message: "Failed to load workspace" });
          }
        }
        return;
      }

      // Slug not in member list: shared-downgrade probe. Look up the cached
      // replica directly — no ref needed since hydration already settled.
      const cachedReplica = selectReplicaBySlug(useWorkspaceReplicaStore.getState(), workspaceSlug);
      if (!cachedReplica) {
        setRoute({ phase: "error", errorKind: "not-found", message: "Workspace not found" });
        return;
      }
      const cachedWsId = cachedReplica.id;
      try {
        const pages = await api.pages.list(cachedWsId);
        if (!request.isCurrent()) return;
        if (pages.length === 0) {
          setRoute({
            phase: "degraded",
            workspaceId: cachedWsId,
            workspaceSlug,
            reason: "stale-shared",
          });
          return;
        }
        await replicaCommands.replaceWorkspace({
          workspace: cachedReplica.workspace,
          accessMode: "shared",
          workspaceRole: null,
          pages,
          members: [],
        });
        cacheStatusRef.current = "live";
        setRoute({ phase: "ready", workspaceId: cachedWsId, accessMode: "shared" });
      } catch (err) {
        if (!request.isCurrent()) return;
        const failure = classifyFailure(err, { online: navigator.onLine });
        const definitive = failure === "forbidden" || failure === "not-found";
        if (definitive) {
          setRoute({
            phase: "degraded",
            workspaceId: cachedWsId,
            workspaceSlug,
            reason: "stale-shared",
          });
        } else {
          setRoute((prev) => {
            if (isWorkspaceReady(prev)) return prev;
            cacheStatusRef.current = "cache";
            return { phase: "ready", workspaceId: cachedWsId, accessMode: "shared" };
          });
        }
      }
    }

    resolve();
    return () => {
      request.cancel();
    };
  }, [workspaceSlug, pageId, online, sessionMode]);

  const contextValue = useMemo<WorkspaceViewContext>(() => ({ route, canonicalSlug }), [route, canonicalSlug]);

  return <WorkspaceViewCtx.Provider value={contextValue}>{children}</WorkspaceViewCtx.Provider>;
}
