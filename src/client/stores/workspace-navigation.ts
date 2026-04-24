import { create } from "zustand";

export interface WorkspaceNavigationState {
  lastVisitedWorkspaceId: string | null;
  lastVisitedPageIdByWorkspaceId: Record<string, string>;
}

const initialState: WorkspaceNavigationState = {
  lastVisitedWorkspaceId: null,
  lastVisitedPageIdByWorkspaceId: {},
};

export const useWorkspaceNavigationStore = create<WorkspaceNavigationState>(() => initialState);

export interface WorkspaceNavigationProjection {
  lastVisitedWorkspaceId: string | null;
  lastVisitedPages: { workspaceId: string; pageId: string }[];
}

export function applyWorkspaceNavigationProjection(projection: WorkspaceNavigationProjection): void {
  const lastVisitedPageIdByWorkspaceId: Record<string, string> = {};
  for (const row of projection.lastVisitedPages) {
    lastVisitedPageIdByWorkspaceId[row.workspaceId] = row.pageId;
  }
  useWorkspaceNavigationStore.setState(
    {
      lastVisitedWorkspaceId: projection.lastVisitedWorkspaceId,
      lastVisitedPageIdByWorkspaceId,
    },
    true,
  );
}

export function resetWorkspaceNavigationProjection(): void {
  useWorkspaceNavigationStore.setState(initialState, true);
}

export function selectLastVisitedWorkspaceId(state: WorkspaceNavigationState): string | null {
  return state.lastVisitedWorkspaceId;
}

export function selectLastVisitedPageId(state: WorkspaceNavigationState, workspaceId: string | null): string | null {
  if (!workspaceId) return null;
  return state.lastVisitedPageIdByWorkspaceId[workspaceId] ?? null;
}

export function useLastVisitedWorkspaceId(): string | null {
  return useWorkspaceNavigationStore(selectLastVisitedWorkspaceId);
}

export function useLastVisitedPageId(workspaceId: string | null): string | null {
  return useWorkspaceNavigationStore((s) => selectLastVisitedPageId(s, workspaceId));
}
