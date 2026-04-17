import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/client/lib/api";
import { classifyFailure } from "@/client/lib/classify-failure";
import { createRequestGuard } from "@/client/lib/request-guard";
import { SESSION_MODES } from "@/client/lib/constants";
import { type WorkspaceRouteState, isWorkspaceReady, hasWorkspaceIdentity } from "@/client/lib/workspace-route-model";
import { useWorkspaceStore, type WorkspaceAccessMode } from "@/client/stores/workspace-store";
import { useAuthStore } from "@/client/stores/auth-store";
import { useOnline } from "@/client/hooks/use-online";
import { WorkspaceViewCtx, type WorkspaceViewContext } from "./use-workspace-view";
import type { Page, Workspace, WorkspaceMember } from "@/shared/types";

function seedFromCache(workspaceSlug: string): WorkspaceRouteState {
  const store = useWorkspaceStore.getState();

  const memberWs = store.memberWorkspaces.find((w) => w.slug === workspaceSlug);
  if (memberWs) {
    const snap = store.snapshotsByWorkspaceId[memberWs.id];
    if (snap) {
      return {
        phase: "ready",
        workspaceId: memberWs.id,
        accessMode: snap.accessMode,
        cacheStatus: "cache",
      };
    }
    return { phase: "loading", workspaceId: memberWs.id };
  }

  const snap = Object.values(store.snapshotsByWorkspaceId).find((s) => s.workspace.slug === workspaceSlug);
  if (snap) {
    return {
      phase: "ready",
      workspaceId: snap.workspace.id,
      accessMode: snap.accessMode,
      cacheStatus: "cache",
    };
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
 *   within the same workspace (the page-surface handles per-page loads).
 */
export function WorkspaceViewProvider({ workspaceSlug, pageId, children }: WorkspaceViewProviderProps) {
  const [route, setRoute] = useState<WorkspaceRouteState>(() => seedFromCache(workspaceSlug));
  const [canonicalSlug, setCanonicalSlug] = useState<string | undefined>();

  const epochRef = useRef(0);
  const activeRef = useRef(true);

  const routeWorkspaceId = hasWorkspaceIdentity(route) ? route.workspaceId : null;
  const workspaceIdRef = useRef(routeWorkspaceId);
  workspaceIdRef.current = routeWorkspaceId;

  const sessionMode = useAuthStore((s) => s.sessionMode);
  const online = useOnline();
  const previousNetworkStateRef = useRef({ online, sessionMode });

  const routeRef = useRef(route);
  routeRef.current = route;

  useEffect(() => {
    if (route.phase !== "ready") return;

    const store = useWorkspaceStore.getState();
    if (store.lastVisitedWorkspaceId !== route.workspaceId) {
      store.setLastVisitedWorkspaceId(route.workspaceId);
    }
  }, [route.phase, route.phase === "ready" ? route.workspaceId : null]);

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
    if (!regainedLiveSession && isWorkspaceReady(currentRoute) && currentRoute.cacheStatus === "live") {
      if (!online) return;
      if (!pageId) return;
      const snap = useWorkspaceStore.getState().snapshotsByWorkspaceId[currentRoute.workspaceId];
      if (snap?.pages.some((p) => p.id === pageId)) return;
    }

    const request = createRequestGuard(epochRef, activeRef);

    async function resolve() {
      // Page-route resolver: pages.context-first when online + authenticated.
      // Bootstraps workspace identity from a single authoritative call,
      // sidestepping slug→workspace resolution entirely.
      if (pageId && online && sessionMode === SESSION_MODES.AUTHENTICATED) {
        try {
          const ctx = await api.pages.context(pageId);
          if (!request.isCurrent()) return;

          const accessMode = ctx.viewer.access_mode as WorkspaceAccessMode;
          const { pages, members } = await fetchWorkspaceData(ctx.workspace.id, accessMode);
          if (!request.isCurrent()) return;

          const store = useWorkspaceStore.getState();
          store.replaceWorkspaceSnapshot(ctx.workspace.id, {
            workspace: ctx.workspace,
            accessMode,
            pages,
            members,
          });
          if (accessMode === "member") {
            store.upsertMemberWorkspace(ctx.workspace);
          }
          store.setLastVisitedWorkspaceId(ctx.workspace.id);

          setRoute({
            phase: "ready",
            workspaceId: ctx.workspace.id,
            accessMode,
            cacheStatus: "live",
          });
          setCanonicalSlug(ctx.workspace.slug !== workspaceSlug ? ctx.workspace.slug : undefined);
        } catch (err) {
          if (!request.isCurrent()) return;
          const failure = classifyFailure(err, { online: navigator.onLine });
          if (failure === "forbidden" || failure === "not-found") {
            setRoute({ phase: "error", errorKind: "not-found", message: "Page not found" });
          } else {
            setRoute((prev) => {
              if (isWorkspaceReady(prev) || prev.phase === "degraded") return prev;
              const cachedWsId = workspaceIdRef.current;
              return cachedWsId
                ? { phase: "degraded", workspaceId: cachedWsId, workspaceSlug, reason: "stale-shared" }
                : { phase: "error", errorKind: "network", message: "Failed to load workspace" };
            });
          }
        }
        return;
      }

      // Shell route or offline page route: slug-first.
      let workspaces: Workspace[];
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
      const store = useWorkspaceStore.getState();
      store.setMemberWorkspaces(workspaces);

      const ws = workspaces.find((w) => w.slug === workspaceSlug);
      if (ws) {
        try {
          const { pages, members } = await fetchWorkspaceData(ws.id, "member");
          if (!request.isCurrent()) return;
          store.replaceWorkspaceSnapshot(ws.id, { workspace: ws, accessMode: "member", pages, members });
          store.setLastVisitedWorkspaceId(ws.id);
          setRoute({
            phase: "ready",
            workspaceId: ws.id,
            accessMode: "member",
            cacheStatus: "live",
          });
        } catch {
          if (!request.isCurrent()) return;
          const snap = store.snapshotsByWorkspaceId[ws.id];
          if (snap) {
            setRoute({
              phase: "ready",
              workspaceId: ws.id,
              accessMode: snap.accessMode,
              cacheStatus: "cache",
            });
          } else {
            setRoute({ phase: "error", errorKind: "network", message: "Failed to load workspace" });
          }
        }
        return;
      }

      // Slug not in member list: shared-downgrade probe.
      const cachedWsId = workspaceIdRef.current;
      if (!cachedWsId) {
        setRoute({ phase: "error", errorKind: "not-found", message: "Workspace not found" });
        return;
      }
      const cachedSnapshot = store.snapshotsByWorkspaceId[cachedWsId];
      if (!cachedSnapshot) {
        setRoute({ phase: "error", errorKind: "not-found", message: "Workspace not found" });
        return;
      }
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
        store.replaceWorkspaceSnapshot(cachedWsId, {
          workspace: cachedSnapshot.workspace,
          accessMode: "shared",
          pages,
          members: [],
        });
        setRoute({
          phase: "ready",
          workspaceId: cachedWsId,
          accessMode: "shared",
          cacheStatus: "live",
        });
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
            return {
              phase: "ready",
              workspaceId: cachedWsId,
              accessMode: "shared",
              cacheStatus: "cache",
            };
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
