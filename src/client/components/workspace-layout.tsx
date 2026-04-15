import { Outlet } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { PageMentionScopeProvider } from "@/client/components/editor/page-mention/scope-provider";
import { useWorkspaceStore, selectActiveWorkspace } from "@/client/stores/workspace-store";

export function WorkspaceLayout() {
  const workspace = useWorkspaceStore(selectActiveWorkspace);
  const accessMode = useWorkspaceStore((s) => s.activeAccessMode);
  const routeSource = useWorkspaceStore((s) => s.activeRouteSource ?? "live");

  const viewer = useMemo(() => {
    if (!workspace || !accessMode) return null;
    return {
      access_mode: accessMode,
      principal_type: "user" as const,
      route_kind: "canonical" as const,
      workspace_slug: workspace.slug,
    };
  }, [accessMode, workspace?.slug]);

  const lookupCachedPage = useCallback(
    (pageId: string) => {
      if (!workspace) return null;
      // Read through the store at lookup time so page-list churn updates cache
      // behavior without recreating the mention scope provider or resolver.
      const page = useWorkspaceStore
        .getState()
        .snapshotsByWorkspaceId[workspace.id]?.pages.find((candidate) => candidate.id === pageId);
      if (!page || page.archived_at) return null;
      return { title: page.title, icon: page.icon };
    },
    [workspace?.id],
  );

  return (
    // Canonical page routes share one mention scope per workspace/viewer so
    // page-to-page navigation keeps resolved mention metadata warm.
    <PageMentionScopeProvider
      workspaceId={workspace?.id}
      viewer={viewer}
      routeSource={routeSource}
      lookupCachedPage={lookupCachedPage}
    >
      <Outlet />
    </PageMentionScopeProvider>
  );
}
