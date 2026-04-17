import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { PageMentionScopeProvider } from "@/client/components/editor/page-mention/scope-provider";
import { api, toApiError } from "@/client/lib/api";
import { classifyFailure } from "@/client/lib/classify-failure";
import { createRequestGuard } from "@/client/lib/request-guard";
import { PageSurfaceProvider } from "@/client/components/page-surface/provider";
import { usePageSurface } from "@/client/components/page-surface/use-page-surface";
import { useAuthStore } from "@/client/stores/auth-store";
import { parseDocMessage } from "@/shared/doc-messages";
import { reportClientError } from "@/client/lib/report-client-error";
import { ShareViewContext, type ShareViewState, type ShareViewStatus } from "./use-share-view";
import type { SharedPageInfo } from "@/shared/types";

interface ShareViewProviderProps {
  token: string;
  activePage: string | undefined;
  children: ReactNode;
}

export function ShareViewProvider({ token, activePage, children }: ShareViewProviderProps) {
  const sessionMode = useAuthStore((s) => s.sessionMode);
  const userId = useAuthStore((s) => s.user?.id ?? null);

  const [info, setInfo] = useState<SharedPageInfo | null>(null);
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
    setInfo(null);

    api.shares
      .resolve(token)
      .then((data) => {
        if (!request.isCurrent()) return;
        setInfo(data);
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

  if (status !== "ready" || !info) {
    // Before the token resolves we cannot mount the page surface (no workspace
    // id / page id known). Expose a minimal view so share-layout / share-header
    // can render loading or error chrome.
    return (
      <ShareViewContext.Provider
        value={{
          status,
          info,
          error,
          displayPageId: null,
          wsProvider: null,
          setWsProvider: () => undefined,
          handleNavigate: () => undefined,
          handleTitleChange: () => undefined,
        }}
      >
        <PageMentionScopeProvider workspaceId={undefined} viewer={null} shareToken={token} mentionCachePolicy="live">
          {children}
        </PageMentionScopeProvider>
      </ShareViewContext.Provider>
    );
  }

  return (
    <PageSurfaceProvider
      surface="share"
      workspaceId={info.workspace_id}
      pageId={activePage ?? info.page_id}
      accessMode="shared"
      role={null}
      pageLoadTarget="live"
      cachedPage={null}
      shareToken={token}
      seedFromTokenPayload={activePage ? null : info}
    >
      <ShareViewBridge status={status} info={info} error={error} token={token} activePage={activePage}>
        {children}
      </ShareViewBridge>
    </PageSurfaceProvider>
  );
}

interface ShareViewBridgeProps {
  status: ShareViewStatus;
  info: SharedPageInfo;
  error: string | null;
  token: string;
  activePage: string | undefined;
  children: ReactNode;
}

function ShareViewBridge({ status, info, error, token, activePage, children }: ShareViewBridgeProps) {
  const navigate = useNavigate();
  const { wsProvider, setWsProvider, patchPage } = usePageSurface();

  // Real-time metadata listener: push icon / cover updates from peers into
  // the surface state so share viewers see them live.
  useEffect(() => {
    if (!wsProvider) return;
    const handler = (message: string) => {
      const msg = parseDocMessage(message);
      if (msg?.type === "page-metadata-updated") {
        patchPage({ icon: msg.icon, cover_url: msg.cover_url });
      }
    };
    wsProvider.on("custom-message", handler);
    return () => wsProvider.off("custom-message", handler);
  }, [wsProvider, patchPage]);

  const handleNavigate = useCallback(
    (pageId: string) => {
      const page = pageId === info.page_id ? undefined : pageId;
      navigate({ to: "/s/$token", params: { token }, search: { page } });
    },
    [info.page_id, token, navigate],
  );

  const handleTitleChange = useCallback(
    (titleOverride: string) => {
      patchPage({ title: titleOverride });
    },
    [patchPage],
  );

  const displayPageId = activePage ?? info.page_id;

  const view = useMemo<ShareViewState>(
    () => ({
      status,
      info,
      error,
      displayPageId,
      wsProvider,
      setWsProvider,
      handleNavigate,
      handleTitleChange,
    }),
    [status, info, error, displayPageId, wsProvider, setWsProvider, handleNavigate, handleTitleChange],
  );

  const viewer = info.viewer ?? null;

  return (
    <ShareViewContext.Provider value={view}>
      <PageMentionScopeProvider
        workspaceId={info.workspace_id}
        viewer={viewer}
        shareToken={token}
        mentionCachePolicy="live"
      >
        {children}
      </PageMentionScopeProvider>
    </ShareViewContext.Provider>
  );
}
