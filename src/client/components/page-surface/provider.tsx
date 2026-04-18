import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type YProvider from "y-partyserver/provider";
import { api, toApiError } from "@/client/lib/api";
import { classifyFailure } from "@/client/lib/classify-failure";
import { getCachedDocKey } from "@/client/lib/constants";
import { isDocCached, removeDocHint } from "@/client/lib/doc-cache-hints";
import { createRequestGuard } from "@/client/lib/request-guard";
import { reportClientError } from "@/client/lib/report-client-error";
import { useAuthStore } from "@/client/stores/auth-store";
import { useOnline } from "@/client/hooks/use-online";
import type { WorkspaceAccessMode } from "@/client/stores/workspace-store";
import type { FailureKind } from "@/client/lib/classify-failure";
import {
  type PageSurfaceKind,
  type PageSurfaceState,
  getPageLoadFailureAction,
  needsRestrictedAncestors,
} from "@/client/lib/page-surface-model";
import { PageSurfaceCtx, type PageLoadTarget, type PageSurfaceContextValue } from "./use-page-surface";
import type { Page, WorkspaceRole } from "@/shared/types";

interface PageSurfaceProviderProps {
  surface: PageSurfaceKind;
  workspaceId: string | null;
  pageId: string;
  accessMode: WorkspaceAccessMode | null;
  role: WorkspaceRole | null;
  pageLoadTarget: PageLoadTarget | null;
  cachedPage: Page | null;
  shareToken: string | null;
  seedPage: PageSurfaceSeed | null;
  onLivePageLoaded?: (page: Page & { can_edit?: boolean }) => void;
  onEvict?: (pageId: string) => void;
  children: ReactNode;
}

export interface PageSurfaceSeed {
  pageId: string;
  workspaceId: string;
  title: string;
  icon: string | null;
  cover_url: string | null;
  canEdit: boolean;
}

/**
 * Build an `unavailable` PageSurfaceState from a classified failure. `reason`
 * distinguishes definitive loss (`gone`) from recoverable classes like
 * network/session issues (`error`); message copy reflects `failureKind` so
 * connection errors are not rendered as "page is gone".
 */
function buildUnavailableState(failureKind: FailureKind, err: unknown): PageSurfaceState {
  switch (failureKind) {
    case "forbidden":
      return {
        kind: "unavailable",
        reason: "gone",
        message: "You no longer have access to this page.",
      };
    case "not-found":
      return {
        kind: "unavailable",
        reason: "gone",
        message: "This page is no longer available.",
      };
    case "network":
      return {
        kind: "unavailable",
        reason: "error",
        message: "Couldn't reach the server. Check your connection and try again.",
      };
    case "auth-ambiguous":
      return {
        kind: "unavailable",
        reason: "error",
        message: "Your session may have expired. Please refresh.",
      };
    case "server":
    case "unknown":
    default:
      return {
        kind: "unavailable",
        reason: "error",
        message: toApiError(err).message,
      };
  }
}

function resolveAncestorsState(
  prev: PageSurfaceState,
  pageId: string,
  shouldLoadRestrictedAncestors: boolean,
): Pick<Extract<PageSurfaceState, { kind: "ready" }>, "ancestors" | "ancestorsStatus"> {
  if (prev.kind === "ready" && prev.page.id === pageId) {
    return {
      ancestors: prev.ancestors,
      ancestorsStatus: prev.ancestorsStatus,
    };
  }

  return {
    ancestors: [],
    ancestorsStatus: shouldLoadRestrictedAncestors ? "loading" : "ready",
  };
}

function buildReadyState(
  page: Page & { can_edit?: boolean },
  source: "live" | "cache",
  prev: PageSurfaceState,
  shouldLoadRestrictedAncestors: boolean,
): PageSurfaceState {
  return {
    kind: "ready",
    source,
    page,
    ...resolveAncestorsState(prev, page.id, shouldLoadRestrictedAncestors),
  };
}

function seedToReadyState(
  seed: PageSurfaceSeed,
  pageId: string,
  prev: PageSurfaceState,
  shouldLoadRestrictedAncestors: boolean,
): PageSurfaceState | null {
  if (seed.pageId !== pageId) return null;
  const seeded: Page & { can_edit: boolean } = {
    id: seed.pageId,
    workspace_id: seed.workspaceId,
    parent_id: null,
    title: seed.title,
    icon: seed.icon,
    cover_url: seed.cover_url,
    position: 0,
    created_by: "",
    created_at: "",
    updated_at: "",
    archived_at: null,
    can_edit: seed.canEdit,
  };
  return buildReadyState(seeded, "cache", prev, shouldLoadRestrictedAncestors);
}

export function PageSurfaceProvider({
  surface,
  workspaceId,
  pageId,
  accessMode,
  role,
  pageLoadTarget,
  cachedPage,
  shareToken,
  seedPage,
  onLivePageLoaded,
  onEvict,
  children,
}: PageSurfaceProviderProps) {
  const online = useOnline();
  const shouldLoadRestrictedAncestors = needsRestrictedAncestors(accessMode, role);

  const [state, setState] = useState<PageSurfaceState>(() => {
    if (seedPage) {
      return (
        seedToReadyState(seedPage, pageId, { kind: "loading" }, shouldLoadRestrictedAncestors) ?? {
          kind: "loading",
        }
      );
    }
    return { kind: "loading" };
  });
  const [wsProvider, setWsProvider] = useState<YProvider | null>(null);
  const epochRef = useRef(0);
  const ancestorEpochRef = useRef(0);
  const activeRef = useRef(true);
  const cachedPageRef = useRef(cachedPage);
  const onlineRef = useRef(online);
  cachedPageRef.current = cachedPage;
  onlineRef.current = online;

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const patchPage = useCallback((updates: Partial<Page & { can_edit?: boolean }>) => {
    setState((prev) => {
      if (prev.kind !== "ready") return prev;
      return { ...prev, page: { ...prev.page, ...updates } };
    });
  }, []);

  useEffect(() => {
    if (pageLoadTarget === null) return;
    const request = createRequestGuard(epochRef, activeRef);

    async function load() {
      // Share root-page fast path: seed payload carries title/icon/cover_url/permission,
      // so the provider can go straight to `ready` without firing api.pages.get.
      if (seedPage && seedPage.pageId === pageId) {
        setState((prev) => seedToReadyState(seedPage, pageId, prev, shouldLoadRestrictedAncestors) ?? prev);
        return;
      }

      // Preserve the mounted editor when equivalent surface inputs reload the
      // same page id instead of tearing down to a skeleton.
      setState((prev) => (prev.kind === "ready" && prev.page.id === pageId ? prev : { kind: "loading" }));

      if (pageLoadTarget === "cached-page") {
        const cached = cachedPageRef.current;
        if (cached) {
          setState((prev) =>
            buildReadyState(cached as Page & { can_edit?: boolean }, "cache", prev, shouldLoadRestrictedAncestors),
          );
        } else {
          setState({
            kind: "unavailable",
            reason: "offline-miss",
            message: "This page isn't available offline yet.",
          });
        }
        return;
      }

      if (pageLoadTarget === "offline-unavailable") {
        setState((prev) =>
          prev.kind === "ready" && prev.page.id === pageId
            ? prev
            : {
                kind: "unavailable",
                reason: "offline-miss",
                message: "This page isn't available offline yet.",
              },
        );
        return;
      }

      if (pageLoadTarget === "cache-unavailable") {
        setState((prev) =>
          prev.kind === "ready" && prev.page.id === pageId
            ? prev
            : {
                kind: "unavailable",
                reason: "error",
                message: "This page can't be loaded right now and isn't available in cache.",
              },
        );
        return;
      }

      if (!workspaceId) return;

      try {
        const data = await api.pages.get(workspaceId, pageId, shareToken ?? undefined);
        if (!request.isCurrent()) return;

        onLivePageLoaded?.(data);

        setState((prev) => {
          return buildReadyState(data, "live", prev, shouldLoadRestrictedAncestors);
        });
      } catch (err) {
        if (!request.isCurrent()) return;

        const currentOnline = onlineRef.current;
        const failureKind = classifyFailure(err, { online: currentOnline });
        const sessionMode = useAuthStore.getState().sessionMode;
        const action = getPageLoadFailureAction(failureKind, currentOnline, sessionMode, surface);

        if (action === "evict") {
          onEvict?.(pageId);
          removeDocHint(pageId);
          import("y-indexeddb").then((m) => m.clearDocument(getCachedDocKey(pageId))).catch(() => {});
          setState({
            kind: "unavailable",
            reason: "gone",
            message: "You no longer have access to this page.",
          });
          return;
        }

        if (action === "cache-fallback") {
          const cached = cachedPageRef.current;
          if (cached) {
            if (isDocCached(pageId)) {
              setState((prev) =>
                buildReadyState(cached as Page & { can_edit?: boolean }, "cache", prev, shouldLoadRestrictedAncestors),
              );
            } else {
              setState({
                kind: "unavailable",
                reason: "offline-miss",
                message: "This page isn't available offline yet.",
              });
            }
          } else {
            setState({
              kind: "unavailable",
              reason: "offline-miss",
              message: "This page isn't available offline yet.",
            });
          }
          return;
        }

        // action === "terminal-gone"
        reportClientError({
          source: surface === "canonical" ? "page.load" : "shared-page.load",
          error: err,
          context: {
            workspaceId,
            pageId,
            online: currentOnline,
            sessionMode,
            failureKind,
          },
        });
        setState(buildUnavailableState(failureKind, err));
      }
    }

    load();
    return () => {
      request.cancel();
    };
  }, [
    surface,
    pageLoadTarget,
    workspaceId,
    pageId,
    shareToken,
    seedPage,
    shouldLoadRestrictedAncestors,
    onLivePageLoaded,
    onEvict,
  ]);
  const readyPageId = state.kind === "ready" ? state.page.id : null;

  useEffect(() => {
    if (state.kind !== "ready") return;
    if (!shouldLoadRestrictedAncestors || !workspaceId) return;

    const request = createRequestGuard(ancestorEpochRef, activeRef);
    const capturedPageId = state.page.id;

    api.pages
      .ancestors(workspaceId, capturedPageId, shareToken ?? undefined)
      .then((ancestors) => {
        if (!request.isCurrent()) return;
        setState((prev) => {
          if (prev.kind !== "ready" || prev.page.id !== capturedPageId) return prev;
          return { ...prev, ancestors, ancestorsStatus: "ready" };
        });
      })
      .catch(() => {
        if (!request.isCurrent()) return;
        setState((prev) => {
          if (prev.kind !== "ready" || prev.page.id !== capturedPageId) return prev;
          if (prev.ancestorsStatus === "ready") return prev;
          return { ...prev, ancestorsStatus: "ready" };
        });
      });

    return () => {
      request.cancel();
    };
  }, [state.kind, readyPageId, workspaceId, shouldLoadRestrictedAncestors, shareToken]);

  const contextValue = useMemo<PageSurfaceContextValue>(
    () => ({ state, wsProvider, setWsProvider, patchPage }),
    [state, wsProvider, patchPage],
  );

  return <PageSurfaceCtx.Provider value={contextValue}>{children}</PageSurfaceCtx.Provider>;
}
