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
  type ActivePageAccess,
  type ActivePagePatch,
  type ActivePageSnapshot,
  type ActivePageState,
  type ActivePageSurface,
  getPageLoadFailureAction,
  needsRestrictedAncestors,
} from "@/client/lib/active-page-model";
import { ActivePageContexts, type PageLoadTarget } from "./use-active-page";
import type { GetPageResponse, Page, PageAncestor, WorkspaceRole } from "@/shared/types";

interface ActivePageProviderProps {
  surface: ActivePageSurface;
  workspaceId: string | null;
  pageId: string;
  accessMode: WorkspaceAccessMode | null;
  role: WorkspaceRole | null;
  pageLoadTarget: PageLoadTarget | null;
  cachedPageMeta: Page | null;
  shareToken: string | null;
  seedPage: ActivePageSeed | null;
  onLivePageLoaded?: (page: Page) => void;
  onEvict?: (pageId: string) => void;
  children: ReactNode;
}

export interface ActivePageSeed {
  pageId: string;
  workspaceId: string;
  title: string;
  icon: string | null;
  coverUrl: string | null;
  accessMode: "view" | "edit";
}

function buildUnavailableState(failureKind: FailureKind, err: unknown): ActivePageState {
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

function snapshotFromPage(
  page: Pick<Page, "id" | "workspace_id" | "title" | "icon" | "cover_url">,
): ActivePageSnapshot {
  return {
    id: page.id,
    workspaceId: page.workspace_id,
    title: page.title,
    icon: page.icon,
    coverUrl: page.cover_url,
  };
}

function accessFromLivePage(page: GetPageResponse): ActivePageAccess {
  return {
    mode: page.can_edit ? "edit" : "view",
    confidence: "authoritative",
  };
}

function accessFromCachedPage(): ActivePageAccess {
  return {
    mode: "edit",
    confidence: "optimistic",
  };
}

function accessFromSeed(seed: ActivePageSeed): ActivePageAccess {
  return {
    mode: seed.accessMode,
    confidence: "authoritative",
  };
}

function resolveAncestorsState(
  prev: ActivePageState,
  pageId: string,
  shouldLoadRestrictedAncestors: boolean,
): Pick<Extract<ActivePageState, { kind: "ready" }>, "ancestors" | "ancestorsStatus"> {
  if (prev.kind === "ready" && prev.snapshot.id === pageId) {
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
  snapshot: ActivePageSnapshot,
  backing: "live" | "cache" | "seed",
  access: ActivePageAccess,
  prev: ActivePageState,
  shouldLoadRestrictedAncestors: boolean,
): ActivePageState {
  return {
    kind: "ready",
    backing,
    snapshot,
    access,
    ...resolveAncestorsState(prev, snapshot.id, shouldLoadRestrictedAncestors),
  };
}

function seedToReadyState(
  seed: ActivePageSeed,
  pageId: string,
  prev: ActivePageState,
  shouldLoadRestrictedAncestors: boolean,
): ActivePageState | null {
  if (seed.pageId !== pageId) return null;
  return buildReadyState(
    {
      id: seed.pageId,
      workspaceId: seed.workspaceId,
      title: seed.title,
      icon: seed.icon,
      coverUrl: seed.coverUrl,
    },
    "seed",
    accessFromSeed(seed),
    prev,
    shouldLoadRestrictedAncestors,
  );
}

export function ActivePageProvider({
  surface,
  workspaceId,
  pageId,
  accessMode,
  role,
  pageLoadTarget,
  cachedPageMeta,
  shareToken,
  seedPage,
  onLivePageLoaded,
  onEvict,
  children,
}: ActivePageProviderProps) {
  const online = useOnline();
  const shouldLoadRestrictedAncestors = needsRestrictedAncestors(accessMode, role);

  const [state, setState] = useState<ActivePageState>(() => {
    if (seedPage) {
      return (
        seedToReadyState(seedPage, pageId, { kind: "loading" }, shouldLoadRestrictedAncestors) ?? {
          kind: "loading",
        }
      );
    }
    return { kind: "loading" };
  });
  const [syncProvider, setSyncProvider] = useState<YProvider | null>(null);
  const epochRef = useRef(0);
  const activeRef = useRef(true);
  const cachedPageRef = useRef(cachedPageMeta);
  const onlineRef = useRef(online);
  cachedPageRef.current = cachedPageMeta;
  onlineRef.current = online;

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const patchPage = useCallback((updates: ActivePagePatch) => {
    setState((prev) => {
      if (prev.kind !== "ready") return prev;
      return {
        ...prev,
        snapshot: {
          ...prev.snapshot,
          ...(updates.title !== undefined ? { title: updates.title } : {}),
          ...(updates.icon !== undefined ? { icon: updates.icon } : {}),
          ...(updates.coverUrl !== undefined ? { coverUrl: updates.coverUrl } : {}),
        },
      };
    });
  }, []);

  useEffect(() => {
    if (pageLoadTarget === null) return;
    const request = createRequestGuard(epochRef, activeRef);

    async function syncRestrictedAncestors(targetPageId: string, ancestorsPromise: Promise<PageAncestor[]> | null) {
      if (!ancestorsPromise) return;

      try {
        const ancestors = await ancestorsPromise;
        if (!request.isCurrent()) return;
        setState((prev) => {
          if (prev.kind !== "ready" || prev.snapshot.id !== targetPageId) return prev;
          return { ...prev, ancestors, ancestorsStatus: "ready" };
        });
      } catch {
        if (!request.isCurrent()) return;
        setState((prev) => {
          if (prev.kind !== "ready" || prev.snapshot.id !== targetPageId) return prev;
          if (prev.ancestorsStatus === "ready") return prev;
          return { ...prev, ancestorsStatus: "ready" };
        });
      }
    }

    async function load() {
      const ancestorsPromise =
        pageLoadTarget === "live" && shouldLoadRestrictedAncestors && workspaceId
          ? api.pages.ancestors(workspaceId, pageId, shareToken ?? undefined)
          : null;

      if (seedPage && seedPage.pageId === pageId) {
        setState((prev) => seedToReadyState(seedPage, pageId, prev, shouldLoadRestrictedAncestors) ?? prev);
        await syncRestrictedAncestors(pageId, ancestorsPromise);
        return;
      }

      setState((prev) => (prev.kind === "ready" && prev.snapshot.id === pageId ? prev : { kind: "loading" }));

      if (pageLoadTarget === "cached-page") {
        const cached = cachedPageRef.current;
        if (cached) {
          setState((prev) =>
            buildReadyState(
              snapshotFromPage(cached),
              "cache",
              accessFromCachedPage(),
              prev,
              shouldLoadRestrictedAncestors,
            ),
          );
          await syncRestrictedAncestors(pageId, ancestorsPromise);
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
          prev.kind === "ready" && prev.snapshot.id === pageId
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
          prev.kind === "ready" && prev.snapshot.id === pageId
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

        onLivePageLoaded?.(data.page);

        setState((prev) =>
          buildReadyState(
            snapshotFromPage(data.page),
            "live",
            accessFromLivePage(data),
            prev,
            shouldLoadRestrictedAncestors,
          ),
        );
        await syncRestrictedAncestors(pageId, ancestorsPromise);
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
                buildReadyState(
                  snapshotFromPage(cached),
                  "cache",
                  accessFromCachedPage(),
                  prev,
                  shouldLoadRestrictedAncestors,
                ),
              );
              await syncRestrictedAncestors(pageId, ancestorsPromise);
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

  const syncValue = useMemo(() => ({ syncProvider, setSyncProvider }), [syncProvider]);
  const actionsValue = useMemo(() => ({ patchPage }), [patchPage]);

  return (
    <ActivePageContexts.State.Provider value={state}>
      <ActivePageContexts.Sync.Provider value={syncValue}>
        <ActivePageContexts.Actions.Provider value={actionsValue}>{children}</ActivePageContexts.Actions.Provider>
      </ActivePageContexts.Sync.Provider>
    </ActivePageContexts.State.Provider>
  );
}
