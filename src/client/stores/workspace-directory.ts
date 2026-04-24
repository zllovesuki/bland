import { create } from "zustand";
import type { MemberWorkspaceRow } from "./db/bland-db";

export interface WorkspaceDirectoryState {
  workspaces: MemberWorkspaceRow[];
}

const initialState: WorkspaceDirectoryState = {
  workspaces: [],
};

export const useWorkspaceDirectoryStore = create<WorkspaceDirectoryState>(() => initialState);

export function applyWorkspaceDirectoryProjection(workspaces: MemberWorkspaceRow[]): void {
  useWorkspaceDirectoryStore.setState({ workspaces }, true);
}

export function resetWorkspaceDirectoryProjection(): void {
  useWorkspaceDirectoryStore.setState(initialState, true);
}

export function selectMemberWorkspaces(state: WorkspaceDirectoryState): MemberWorkspaceRow[] {
  return state.workspaces;
}

export function selectMemberWorkspaceCount(state: WorkspaceDirectoryState): number {
  return state.workspaces.length;
}

export function selectWorkspaceBySlug(state: WorkspaceDirectoryState, slug: string): MemberWorkspaceRow | null {
  return state.workspaces.find((w) => w.slug === slug) ?? null;
}

export function selectWorkspaceById(state: WorkspaceDirectoryState, id: string): MemberWorkspaceRow | null {
  return state.workspaces.find((w) => w.id === id) ?? null;
}

/**
 * Root-redirect / home-slug preference. Prefers the last-visited workspace
 * when the caller still has membership; falls back to the first listed
 * workspace. Returns null when the caller has no member workspaces.
 */
export function selectFirstMemberSlug(
  state: WorkspaceDirectoryState,
  lastVisitedWorkspaceId: string | null,
): string | null {
  if (lastVisitedWorkspaceId) {
    const match = state.workspaces.find((w) => w.id === lastVisitedWorkspaceId);
    if (match) return match.slug;
  }
  return state.workspaces[0]?.slug ?? null;
}

export function useMemberWorkspaces(): MemberWorkspaceRow[] {
  return useWorkspaceDirectoryStore(selectMemberWorkspaces);
}

export function useMemberWorkspaceCount(): number {
  return useWorkspaceDirectoryStore(selectMemberWorkspaceCount);
}

export function useWorkspaceBySlug(slug: string | null | undefined): MemberWorkspaceRow | null {
  return useWorkspaceDirectoryStore((s) => (slug ? selectWorkspaceBySlug(s, slug) : null));
}
