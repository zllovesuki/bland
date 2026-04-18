import { useMemo } from "react";
import { useParams } from "@tanstack/react-router";
import { getPageLoadTarget, type PageLoadTarget } from "@/client/lib/page-load-target";
import { hasWorkspaceIdentity } from "@/client/lib/workspace-route-model";
import { isDocCached } from "@/client/lib/doc-cache-hints";
import { useOnline } from "@/client/hooks/use-online";
import { useAuthStore } from "@/client/stores/auth-store";
import { useWorkspaceStore, type WorkspaceAccessMode } from "@/client/stores/workspace-store";
import { useWorkspaceView } from "./use-workspace-view";
import type { Page, Workspace, WorkspaceMember } from "@/shared/types";

export type { PageLoadTarget };

export interface CanonicalPageContextValue {
  workspaceId: string | null;
  currentPageMeta: Page | null;
  workspace: Workspace | null;
  pages: Page[];
  members: WorkspaceMember[];
  accessMode: WorkspaceAccessMode | null;
  pageLoadTarget: PageLoadTarget | null;
}

/**
 * Derive canonical page inputs from the current workspace route and snapshot
 * store. Layout and page-level consumers can call this directly without a
 * layout-owned context provider.
 */
export function useCanonicalPageContext(): CanonicalPageContextValue {
  const { route } = useWorkspaceView();
  const params = useParams({ strict: false }) as { pageId?: string };
  const online = useOnline();
  const sessionMode = useAuthStore((s) => s.sessionMode);

  const workspaceId = hasWorkspaceIdentity(route) ? route.workspaceId : null;
  const snapshot = useWorkspaceStore((s) => (workspaceId ? (s.snapshotsByWorkspaceId[workspaceId] ?? null) : null));

  const workspace = snapshot?.workspace ?? null;
  const accessMode = route.phase === "ready" ? route.accessMode : (snapshot?.accessMode ?? null);
  const currentPageMeta = params.pageId ? (snapshot?.pages.find((page) => page.id === params.pageId) ?? null) : null;
  const pageLoadTarget = params.pageId
    ? getPageLoadTarget({
        route,
        online,
        sessionMode,
        cachedPage: currentPageMeta,
        docCached: isDocCached(params.pageId),
        workspaceId,
      })
    : null;

  return useMemo(
    () => ({
      workspaceId,
      currentPageMeta,
      workspace,
      pages: snapshot?.pages ?? [],
      members: snapshot?.members ?? [],
      accessMode,
      pageLoadTarget,
    }),
    [accessMode, currentPageMeta, pageLoadTarget, snapshot, workspaceId, workspace],
  );
}
