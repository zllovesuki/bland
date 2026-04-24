import { create } from "zustand";
import type { Page, Workspace, WorkspaceMember, WorkspaceRole } from "@/shared/types";
import type { PageAccessMode, WorkspaceAccessMode, WorkspacePageRow, WorkspaceReplicaRow } from "./db/bland-db";

export type { PageAccessMode, WorkspaceAccessMode } from "./db/bland-db";

export interface WorkspaceReplicaState {
  replicas: Map<string, WorkspaceReplicaRow>;
  pagesByWorkspaceId: Map<string, WorkspacePageRow[]>;
  /** Precomputed `!archived_at` slice, updated together with
   *  `pagesByWorkspaceId` to keep array references stable across renders. */
  activePagesByWorkspaceId: Map<string, WorkspacePageRow[]>;
  pagesById: Map<string, WorkspacePageRow>;
  membersByWorkspaceId: Map<string, WorkspaceMember[]>;
  pageAccessByPageId: Map<string, PageAccessMode>;
}

const initialState: WorkspaceReplicaState = {
  replicas: new Map(),
  pagesByWorkspaceId: new Map(),
  activePagesByWorkspaceId: new Map(),
  pagesById: new Map(),
  membersByWorkspaceId: new Map(),
  pageAccessByPageId: new Map(),
};

export const useWorkspaceReplicaStore = create<WorkspaceReplicaState>(() => initialState);

export interface WorkspaceReplicaProjection {
  replicas: WorkspaceReplicaRow[];
  pages: WorkspacePageRow[];
  members: WorkspaceMember[];
  pageAccess: { pageId: string; mode: PageAccessMode }[];
}

export function applyWorkspaceReplicaProjection(projection: WorkspaceReplicaProjection): void {
  const replicas = new Map<string, WorkspaceReplicaRow>();
  for (const row of projection.replicas) replicas.set(row.id, row);

  const pagesByWorkspaceId = new Map<string, WorkspacePageRow[]>();
  const activePagesByWorkspaceId = new Map<string, WorkspacePageRow[]>();
  const pagesById = new Map<string, WorkspacePageRow>();
  for (const page of projection.pages) {
    pagesById.set(page.id, page);
    const bucket = pagesByWorkspaceId.get(page.workspace_id);
    if (bucket) bucket.push(page);
    else pagesByWorkspaceId.set(page.workspace_id, [page]);
    if (!page.archived_at) {
      const activeBucket = activePagesByWorkspaceId.get(page.workspace_id);
      if (activeBucket) activeBucket.push(page);
      else activePagesByWorkspaceId.set(page.workspace_id, [page]);
    }
  }

  const membersByWorkspaceId = new Map<string, WorkspaceMember[]>();
  for (const member of projection.members) {
    const bucket = membersByWorkspaceId.get(member.workspace_id);
    if (bucket) bucket.push(member);
    else membersByWorkspaceId.set(member.workspace_id, [member]);
  }

  const pageAccessByPageId = new Map<string, PageAccessMode>();
  for (const row of projection.pageAccess) pageAccessByPageId.set(row.pageId, row.mode);

  useWorkspaceReplicaStore.setState(
    {
      replicas,
      pagesByWorkspaceId,
      activePagesByWorkspaceId,
      pagesById,
      membersByWorkspaceId,
      pageAccessByPageId,
    },
    true,
  );
}

export function resetWorkspaceReplicaProjection(): void {
  useWorkspaceReplicaStore.setState(
    {
      replicas: new Map(),
      pagesByWorkspaceId: new Map(),
      activePagesByWorkspaceId: new Map(),
      pagesById: new Map(),
      membersByWorkspaceId: new Map(),
      pageAccessByPageId: new Map(),
    },
    true,
  );
}

const EMPTY_PAGES: WorkspacePageRow[] = [];
const EMPTY_MEMBERS: WorkspaceMember[] = [];

export function selectWorkspaceReplica(
  state: WorkspaceReplicaState,
  workspaceId: string | null,
): WorkspaceReplicaRow | null {
  if (!workspaceId) return null;
  return state.replicas.get(workspaceId) ?? null;
}

export function selectWorkspaceHead(state: WorkspaceReplicaState, workspaceId: string | null): Workspace | null {
  return selectWorkspaceReplica(state, workspaceId)?.workspace ?? null;
}

export function selectWorkspaceAccessMode(
  state: WorkspaceReplicaState,
  workspaceId: string | null,
): WorkspaceAccessMode | null {
  return selectWorkspaceReplica(state, workspaceId)?.accessMode ?? null;
}

export function selectWorkspaceRole(state: WorkspaceReplicaState, workspaceId: string | null): WorkspaceRole | null {
  return selectWorkspaceReplica(state, workspaceId)?.workspaceRole ?? null;
}

export function selectWorkspacePages(state: WorkspaceReplicaState, workspaceId: string | null): WorkspacePageRow[] {
  if (!workspaceId) return EMPTY_PAGES;
  return state.pagesByWorkspaceId.get(workspaceId) ?? EMPTY_PAGES;
}

export function selectActiveWorkspacePages(
  state: WorkspaceReplicaState,
  workspaceId: string | null,
): WorkspacePageRow[] {
  if (!workspaceId) return EMPTY_PAGES;
  return state.activePagesByWorkspaceId.get(workspaceId) ?? EMPTY_PAGES;
}

export function selectWorkspaceMembers(state: WorkspaceReplicaState, workspaceId: string | null): WorkspaceMember[] {
  if (!workspaceId) return EMPTY_MEMBERS;
  return state.membersByWorkspaceId.get(workspaceId) ?? EMPTY_MEMBERS;
}

export function selectPageAccessMode(state: WorkspaceReplicaState, pageId: string): PageAccessMode {
  return state.pageAccessByPageId.get(pageId) ?? "view";
}

export function selectHasPageAccessEntry(state: WorkspaceReplicaState, pageId: string): boolean {
  return state.pageAccessByPageId.has(pageId);
}

export function selectPageById(state: WorkspaceReplicaState, pageId: string): Page | null {
  return state.pagesById.get(pageId) ?? null;
}

/**
 * Preserves the legacy `findCachedWorkspaceIdForPage` semantics: matches any
 * cached page row regardless of archived state. Used for cold-start cache
 * seeding from a page URL when slug lookup fails.
 */
export function selectWorkspaceByPageId(state: WorkspaceReplicaState, pageId: string): string | null {
  const row = state.pagesById.get(pageId);
  return row?.workspace_id ?? null;
}

export function selectReplicaBySlug(state: WorkspaceReplicaState, slug: string): WorkspaceReplicaRow | null {
  for (const replica of state.replicas.values()) {
    if (replica.slug === slug) return replica;
  }
  return null;
}

export function useWorkspaceReplica(workspaceId: string | null): WorkspaceReplicaRow | null {
  return useWorkspaceReplicaStore((s) => selectWorkspaceReplica(s, workspaceId));
}

export function useWorkspaceHead(workspaceId: string | null): Workspace | null {
  return useWorkspaceReplicaStore((s) => selectWorkspaceHead(s, workspaceId));
}

export function useWorkspacePages(workspaceId: string | null): WorkspacePageRow[] {
  return useWorkspaceReplicaStore((s) => selectWorkspacePages(s, workspaceId));
}

export function useActiveWorkspacePages(workspaceId: string | null): WorkspacePageRow[] {
  return useWorkspaceReplicaStore((s) => selectActiveWorkspacePages(s, workspaceId));
}

export function useWorkspaceMembers(workspaceId: string | null): WorkspaceMember[] {
  return useWorkspaceReplicaStore((s) => selectWorkspaceMembers(s, workspaceId));
}

export function useWorkspaceRole(workspaceId: string | null): WorkspaceRole | null {
  return useWorkspaceReplicaStore((s) => selectWorkspaceRole(s, workspaceId));
}

export function useWorkspaceAccessMode(workspaceId: string | null): WorkspaceAccessMode | null {
  return useWorkspaceReplicaStore((s) => selectWorkspaceAccessMode(s, workspaceId));
}

export function usePageAccessMode(pageId: string): PageAccessMode {
  return useWorkspaceReplicaStore((s) => selectPageAccessMode(s, pageId));
}

export function usePageById(pageId: string | null | undefined): Page | null {
  return useWorkspaceReplicaStore((s) => (pageId ? selectPageById(s, pageId) : null));
}
