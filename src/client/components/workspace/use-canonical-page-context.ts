import { useMemo } from "react";
import { useParams } from "@tanstack/react-router";
import { hasWorkspaceIdentity } from "@/client/lib/workspace-route-model";
import {
  usePageById,
  useWorkspaceAccessMode,
  useWorkspaceHead,
  useWorkspaceMembers,
  useWorkspacePages,
  useWorkspaceRole,
  type WorkspaceAccessMode,
} from "@/client/stores/workspace-replica";
import { useWorkspaceView } from "./use-workspace-view";
import type { Page, Workspace, WorkspaceMember, WorkspaceRole } from "@/shared/types";

export interface CanonicalPageContextValue {
  workspaceId: string | null;
  currentPageMeta: Page | null;
  workspace: Workspace | null;
  pages: Page[];
  members: WorkspaceMember[];
  accessMode: WorkspaceAccessMode | null;
  workspaceRole: WorkspaceRole | null;
}

/**
 * Derive canonical page inputs from the current workspace route and replica
 * store. Layout and page-level consumers can call this directly without a
 * layout-owned context provider.
 */
export function useCanonicalPageContext(): CanonicalPageContextValue {
  const { route } = useWorkspaceView();
  const params = useParams({ strict: false }) as { pageId?: string };

  const workspaceId = hasWorkspaceIdentity(route) ? route.workspaceId : null;
  const workspace = useWorkspaceHead(workspaceId);
  const replicaAccessMode = useWorkspaceAccessMode(workspaceId);
  const workspaceRole = useWorkspaceRole(workspaceId);
  const pages = useWorkspacePages(workspaceId);
  const members = useWorkspaceMembers(workspaceId);
  const currentPageMeta = usePageById(params.pageId ?? null);

  const accessMode = route.phase === "ready" ? route.accessMode : replicaAccessMode;

  return useMemo(
    () => ({
      workspaceId,
      currentPageMeta,
      workspace,
      pages,
      members,
      accessMode,
      workspaceRole,
    }),
    [accessMode, workspaceRole, currentPageMeta, pages, members, workspaceId, workspace],
  );
}
