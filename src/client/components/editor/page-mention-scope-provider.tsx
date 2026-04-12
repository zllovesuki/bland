import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ResolvedViewerContext } from "@/shared/types";
import type { WorkspaceRouteSource } from "@/client/stores/workspace-store";
import { createPageMentionResolver } from "./lib/page-mention-resolver";
import { getPageMentionEffectiveShareToken, getPageMentionResolverScopeKey } from "./lib/page-mention-resolver-config";
import type { PageMentionContextValue, PageMentionNavigateTarget } from "./page-mention-context";
import { PageMentionScopeContext } from "./page-mention-scope-context";

interface PageMentionScopeProviderProps {
  children: ReactNode;
  workspaceId: string | undefined;
  viewer: ResolvedViewerContext | null;
  shareToken?: string;
  routeSource: WorkspaceRouteSource;
  lookupCachedPage?: (pageId: string) => { title: string; icon: string | null } | null;
}

export function PageMentionScopeProvider({
  children,
  workspaceId,
  viewer,
  shareToken,
  routeSource,
  lookupCachedPage,
}: PageMentionScopeProviderProps) {
  const navigate = useNavigate();
  const routeSourceRef = useRef(routeSource);
  const lookupCachedPageRef = useRef(lookupCachedPage);
  routeSourceRef.current = routeSource;
  lookupCachedPageRef.current = lookupCachedPage;

  const effectiveShareToken = useMemo(
    () => (viewer ? (getPageMentionEffectiveShareToken(viewer, shareToken) ?? undefined) : undefined),
    [shareToken, viewer?.principal_type],
  );

  const scopeKey = useMemo(() => {
    if (!workspaceId || !viewer) return null;
    return getPageMentionResolverScopeKey(viewer, shareToken);
  }, [
    shareToken,
    viewer?.access_mode,
    viewer?.principal_type,
    viewer?.route_kind,
    viewer?.workspace_slug,
    workspaceId,
  ]);

  const scopeViewer = useMemo(() => {
    if (!viewer || !scopeKey) return null;
    return {
      access_mode: viewer.access_mode,
      principal_type: viewer.principal_type,
      route_kind: viewer.route_kind,
      workspace_slug: viewer.workspace_slug,
    } satisfies ResolvedViewerContext;
  }, [scopeKey, viewer?.access_mode, viewer?.principal_type, viewer?.route_kind, viewer?.workspace_slug]);

  const [resolver, setResolver] = useState<ReturnType<typeof createPageMentionResolver> | null>(null);

  useEffect(() => {
    // Keep one resolver per surface scope, not per page/editor instance.
    // Constructing it in an effect avoids StrictMode's mount-cleanup-remount
    // cycle leaving the initial resolver permanently disposed in development.
    // Important: depend only on primitive scope fields. Canonical route
    // bootstraps replace workspace snapshot objects on page navigation, and
    // tying this effect to `viewer` object identity would still recreate the
    // resolver for same-scope page changes, causing the pending flash.
    if (!workspaceId || !scopeViewer || !scopeKey) {
      setResolver(null);
      return;
    }

    const nextResolver = createPageMentionResolver({
      workspaceId,
      shareToken: effectiveShareToken,
      viewer: scopeViewer,
      getRouteSource: () => routeSourceRef.current,
      lookupCachedPage: (pageId) => lookupCachedPageRef.current?.(pageId) ?? null,
    });
    nextResolver.syncPolicy();
    setResolver(nextResolver);

    return () => {
      nextResolver.dispose();
    };
  }, [effectiveShareToken, scopeKey, scopeViewer, workspaceId]);

  useEffect(() => {
    resolver?.syncPolicy();
  }, [resolver, routeSource]);

  const handleMentionNavigate = useCallback(
    (target: PageMentionNavigateTarget) => {
      if (target.routeKind === "shared") {
        if (!effectiveShareToken) return;
        navigate({
          to: "/s/$token",
          params: { token: effectiveShareToken },
          search: { page: target.pageId },
        });
        return;
      }

      navigate({
        to: "/$workspaceSlug/$pageId",
        params: { workspaceSlug: target.workspaceSlug, pageId: target.pageId },
      });
    },
    [effectiveShareToken, navigate],
  );

  const scopeValue = useMemo(() => ({ resolver, navigate: handleMentionNavigate }), [handleMentionNavigate, resolver]);

  return <PageMentionScopeContext.Provider value={scopeValue}>{children}</PageMentionScopeContext.Provider>;
}
