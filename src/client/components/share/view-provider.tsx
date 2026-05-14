import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toApiError } from "@/client/lib/api";
import { classifyFailure } from "@/client/lib/classify-failure";
import { shareResolveQueryOptions } from "@/client/lib/queries/share-resolve";
import { useAuthStore } from "@/client/stores/auth-store";
import { reportClientError } from "@/client/lib/report-client-error";
import { ShareViewContext, type ShareViewState, type ShareViewStatus } from "./use-share-view";
import type { ShareRootPage } from "@/client/lib/share-page-model";
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
  const shareQuery = useQuery(shareResolveQueryOptions(token, sessionMode, userId));

  // Layer 1: Token resolution. Owns share-link identity only; page data lives
  // in the page surface below. Dependencies are scoped to token/session/user
  // so subpage navigation (`activePage`) keeps the mounted surface alive.
  useEffect(() => {
    if (!shareQuery.error) return;
    const failureKind = classifyFailure(shareQuery.error, { online: navigator.onLine });
    if (failureKind !== "network") {
      reportClientError({
        source: "shared-page.resolve",
        error: shareQuery.error,
        context: { sessionMode, failureKind },
      });
    }
  }, [sessionMode, shareQuery.error]);

  const resolvedShare = shareQuery.data ?? null;
  const status: ShareViewStatus = shareQuery.isError ? "error" : resolvedShare ? "ready" : "loading";
  const error =
    shareQuery.error && classifyFailure(shareQuery.error, { online: navigator.onLine }) === "network"
      ? "This shared page requires a connection."
      : shareQuery.error
        ? toApiError(shareQuery.error).message
        : null;
  const workspaceId = resolvedShare?.workspace_id ?? null;
  const viewer: ResolvedViewerContext | null = resolvedShare?.viewer ?? null;
  const rootPage = useMemo<ShareRootPage | null>(
    () =>
      resolvedShare
        ? {
            id: resolvedShare.page_id,
            kind: resolvedShare.kind,
            title: resolvedShare.title,
            icon: resolvedShare.icon,
            cover_url: resolvedShare.cover_url,
            permission: resolvedShare.permission,
          }
        : null,
    [resolvedShare],
  );

  const rootPageId = rootPage?.id ?? null;
  const activePageId = rootPageId ? (activePage ?? rootPageId) : null;

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
    [status, workspaceId, viewer, rootPage, rootPageId, activePageId, token, navigateToPage, error],
  );

  return <ShareViewContext.Provider value={view}>{children}</ShareViewContext.Provider>;
}
