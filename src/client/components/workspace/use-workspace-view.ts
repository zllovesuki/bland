import { createContext, use } from "react";
import { hasWorkspaceIdentity, type WorkspaceRouteState } from "@/client/lib/workspace-route-model";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import type { Page, Workspace, WorkspaceMember, WorkspaceRole } from "@/shared/types";

export interface WorkspaceViewContext {
  route: WorkspaceRouteState;
  canonicalSlug: string | undefined;
}

export const WorkspaceViewCtx = createContext<WorkspaceViewContext | null>(null);

const EMPTY_PAGES: Page[] = [];
const EMPTY_MEMBERS: WorkspaceMember[] = [];

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
  return useWorkspaceStore((s) =>
    workspaceId ? (s.snapshotsByWorkspaceId[workspaceId]?.pages ?? EMPTY_PAGES) : EMPTY_PAGES,
  );
}

export function useWorkspaceMembers(): WorkspaceMember[] {
  const { route } = useWorkspaceView();
  const workspaceId = hasWorkspaceIdentity(route) ? route.workspaceId : null;
  return useWorkspaceStore((s) =>
    workspaceId ? (s.snapshotsByWorkspaceId[workspaceId]?.members ?? EMPTY_MEMBERS) : EMPTY_MEMBERS,
  );
}

/** Caller's role in the current workspace (read from the snapshot — null when
 *  no membership exists or the current view is shared-surface). */
export function useWorkspaceRole(): WorkspaceRole | null {
  const { route } = useWorkspaceView();
  const workspaceId = hasWorkspaceIdentity(route) ? route.workspaceId : null;
  return useWorkspaceStore((s) =>
    workspaceId ? (s.snapshotsByWorkspaceId[workspaceId]?.workspaceRole ?? null) : null,
  );
}

/** Live workspace identity, read from the authoritative snapshot store. */
export function useCurrentWorkspace(): Workspace | null {
  const { route } = useWorkspaceView();
  const workspaceId = hasWorkspaceIdentity(route) ? route.workspaceId : null;
  return useWorkspaceStore((s) => (workspaceId ? (s.snapshotsByWorkspaceId[workspaceId]?.workspace ?? null) : null));
}
