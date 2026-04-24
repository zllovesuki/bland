import { createContext, use } from "react";
import { hasWorkspaceIdentity, type WorkspaceRouteState } from "@/client/lib/workspace-route-model";
import {
  useWorkspaceHead,
  useWorkspacePages as useReplicaPages,
  useWorkspaceMembers as useReplicaMembers,
  useWorkspaceRole as useReplicaRole,
} from "@/client/stores/workspace-replica";
import type { Page, Workspace, WorkspaceMember, WorkspaceRole } from "@/shared/types";

export interface WorkspaceViewContext {
  route: WorkspaceRouteState;
  canonicalSlug: string | undefined;
}

export const WorkspaceViewCtx = createContext<WorkspaceViewContext | null>(null);

export function useWorkspaceView(): WorkspaceViewContext {
  const ctx = use(WorkspaceViewCtx);
  if (!ctx) throw new Error("useWorkspaceView must be used inside WorkspaceViewProvider");
  return ctx;
}

export function useMaybeWorkspaceView(): WorkspaceViewContext | null {
  return use(WorkspaceViewCtx);
}

export function useWorkspaceRouteState(): WorkspaceRouteState {
  return useWorkspaceView().route;
}

export function useWorkspacePages(): Page[] {
  const { route } = useWorkspaceView();
  const workspaceId = hasWorkspaceIdentity(route) ? route.workspaceId : null;
  return useReplicaPages(workspaceId);
}

export function useWorkspaceMembers(): WorkspaceMember[] {
  const { route } = useWorkspaceView();
  const workspaceId = hasWorkspaceIdentity(route) ? route.workspaceId : null;
  return useReplicaMembers(workspaceId);
}

/** Caller's role in the current workspace (read from the replica — null when
 *  no membership exists or the current view is shared-surface). */
export function useWorkspaceRole(): WorkspaceRole | null {
  const { route } = useWorkspaceView();
  const workspaceId = hasWorkspaceIdentity(route) ? route.workspaceId : null;
  return useReplicaRole(workspaceId);
}

/** Live workspace identity, read from the authoritative replica store. */
export function useCurrentWorkspace(): Workspace | null {
  const { route } = useWorkspaceView();
  const workspaceId = hasWorkspaceIdentity(route) ? route.workspaceId : null;
  return useWorkspaceHead(workspaceId);
}
