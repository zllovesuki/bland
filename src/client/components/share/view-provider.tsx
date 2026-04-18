import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { PageMentionScopeProvider } from "@/client/components/editor/page-mention/scope-provider";
import { api, toApiError } from "@/client/lib/api";
import { classifyFailure } from "@/client/lib/classify-failure";
import { createRequestGuard } from "@/client/lib/request-guard";
import { useAuthStore } from "@/client/stores/auth-store";
import { reportClientError } from "@/client/lib/report-client-error";
import { ShareViewContext, type ShareRootPage, type ShareViewState, type ShareViewStatus } from "./use-share-view";
import type { ResolvedViewerContext } from "@/shared/types";

interface ShareViewProviderProps {
  token: string;
  activePage: string | undefined;
  children: ReactNode;
}

export function ShareViewProvider({ token, activePage, children }: ShareViewProviderProps) {
  const navigate = useNavigate();
  const sessionMode = useAuthStore((s) => s.sessionMode);
  const userId = useAuthStore((s) => s.user?.id ?? null);

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ResolvedViewerContext | null>(null);
  const [rootPage, setRootPage] = useState<ShareRootPage | null>(null);
  const [status, setStatus] = useState<ShareViewStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const tokenEpochRef = useRef(0);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  // Layer 1: Token resolution. Owns share-link identity only; page data lives
  // in the page surface below. Dependencies are scoped to token/session/user
  // so subpage navigation (`activePage`) keeps the mounted surface alive.
  useEffect(() => {
    const request = createRequestGuard(tokenEpochRef, activeRef);
    setStatus("loading");
    setError(null);
    // Clear resolved info so sibling consumers collapse to their own loading
    // state during auth/user re-resolution instead of leaving the previous
    // share tree visible and clickable.
    setWorkspaceId(null);
    setViewer(null);
    setRootPage(null);

    api.shares
      .resolve(token)
      .then((data) => {
        if (!request.isCurrent()) return;
        setWorkspaceId(data.workspace_id);
        setViewer(data.viewer);
        setRootPage({
          id: data.page_id,
          title: data.title,
          icon: data.icon,
          cover_url: data.cover_url,
          permission: data.permission,
        });
        setStatus("ready");
      })
      .catch((err) => {
        if (!request.isCurrent()) return;
        const failureKind = classifyFailure(err, { online: navigator.onLine });
        if (failureKind !== "network") {
          reportClientError({
            source: "shared-page.resolve",
            error: err,
            context: { sessionMode, failureKind },
          });
        }
        setError(failureKind === "network" ? "This shared page requires a connection." : toApiError(err).message);
        setStatus("error");
      });

    return () => {
      request.cancel();
    };
  }, [sessionMode, token, userId]);

  const rootPageId = rootPage?.id ?? null;
  const activePageId = rootPageId ? (activePage ?? rootPageId) : null;

  const patchRootPage = useCallback((updates: Partial<ShareRootPage>) => {
    setRootPage((current) => (current ? { ...current, ...updates } : current));
  }, []);

  const navigateToPage = useCallback(
    (pageId: string) => {
      if (!rootPageId) return;
      const page = pageId === rootPageId ? undefined : pageId;
      navigate({ to: "/s/$token", params: { token }, search: { page } });
    },
    [rootPageId, token, navigate],
  );

  const view = useMemo<ShareViewState>(
    () =>
      status === "ready" && workspaceId && viewer && rootPage && rootPageId && activePageId
        ? {
            status: "ready",
            error: null,
            token,
            workspaceId,
            viewer,
            rootPageId,
            rootPage,
            activePageId,
            navigate: navigateToPage,
            patchRootPage,
          }
        : status === "error" && error
          ? {
              status: "error",
              error,
              token,
            }
          : {
              status: "loading",
              error: null,
              token,
            },
    [status, workspaceId, viewer, rootPage, rootPageId, activePageId, token, navigateToPage, patchRootPage, error],
  );

  return (
    <ShareViewContext.Provider value={view}>
      <PageMentionScopeProvider
        workspaceId={workspaceId ?? undefined}
        viewer={viewer}
        shareToken={token}
        mentionCachePolicy="live"
      >
        {children}
      </PageMentionScopeProvider>
    </ShareViewContext.Provider>
  );
}
