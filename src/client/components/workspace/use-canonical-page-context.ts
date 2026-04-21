import { useMemo } from "react";
import { useParams } from "@tanstack/react-router";
import { hasWorkspaceIdentity } from "@/client/lib/workspace-route-model";
import { useWorkspaceStore, type WorkspaceAccessMode } from "@/client/stores/workspace-store";
import { useWorkspaceView } from "./use-workspace-view";
import type { Page, Workspace, WorkspaceMember } from "@/shared/types";

export interface CanonicalPageContextValue {
  workspaceId: string | null;
  currentPageMeta: Page | null;
  workspace: Workspace | null;
  pages: Page[];
  members: WorkspaceMember[];
  accessMode: WorkspaceAccessMode | null;
}

/**
 * Derive canonical page inputs from the current workspace route and snapshot
 * store. Layout and page-level consumers can call this directly without a
 * layout-owned context provider.
 */
export function useCanonicalPageContext(): CanonicalPageContextValue {
  const { route } = useWorkspaceView();
  const params = useParams({ strict: false }) as { pageId?: string };

  const workspaceId = hasWorkspaceIdentity(route) ? route.workspaceId : null;
  const snapshot = useWorkspaceStore((s) => (workspaceId ? (s.snapshotsByWorkspaceId[workspaceId] ?? null) : null));

  const workspace = snapshot?.workspace ?? null;
  const accessMode = route.phase === "ready" ? route.accessMode : (snapshot?.accessMode ?? null);
  const currentPageMeta = params.pageId ? (snapshot?.pages.find((page) => page.id === params.pageId) ?? null) : null;

  return useMemo(
    () => ({
      workspaceId,
      currentPageMeta,
      workspace,
      pages: snapshot?.pages ?? [],
      members: snapshot?.members ?? [],
      accessMode,
    }),
    [accessMode, currentPageMeta, snapshot, workspaceId, workspace],
  );
}
