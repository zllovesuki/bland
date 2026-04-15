import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Workspace, Page, WorkspaceMember, SharedWithMeItem } from "@/shared/types";
import { STORAGE_KEYS } from "@/client/lib/constants";
import { clearAllCachedDocs } from "@/client/lib/doc-cache-hints";

export type WorkspaceAccessMode = "member" | "shared";
export type WorkspaceRouteSource = "live" | "cache";

export interface WorkspaceSnapshot {
  workspace: Workspace;
  accessMode: WorkspaceAccessMode;
  pages: Page[];
  members: WorkspaceMember[];
}

interface WorkspaceState {
  memberWorkspaces: Workspace[];
  sharedInbox: SharedWithMeItem[];
  snapshotsByWorkspaceId: Record<string, WorkspaceSnapshot>;
  pageMetaById: Record<string, Page>;
  lastVisitedWorkspaceId: string | null;
  cacheUserId: string | null;

  activeWorkspaceId: string | null;
  activeAccessMode: WorkspaceAccessMode | null;
  activeRouteSource: WorkspaceRouteSource | null;

  setMemberWorkspaces(ws: Workspace[]): void;
  upsertMemberWorkspace(ws: Workspace): void;
  removeMemberWorkspace(workspaceId: string): void;
  setSharedInbox(items: SharedWithMeItem[]): void;

  replaceWorkspaceSnapshot(workspaceId: string, snapshot: WorkspaceSnapshot): void;
  patchWorkspace(workspaceId: string, updates: Partial<Workspace>): void;
  removeWorkspaceSnapshot(workspaceId: string): void;

  addPageToSnapshot(workspaceId: string, page: Page): void;
  updatePageInSnapshot(workspaceId: string, pageId: string, updates: Partial<Page>): void;
  removePageFromSnapshot(workspaceId: string, pageId: string): void;
  archivePageInSnapshot(workspaceId: string, pageId: string): void;
  replaceSnapshotMembers(workspaceId: string, members: WorkspaceMember[]): void;

  setLastVisitedWorkspaceId(id: string | null): void;

  setActiveRoute(workspaceId: string, accessMode: WorkspaceAccessMode, source: WorkspaceRouteSource): void;
  clearActiveRoute(): void;

  validateCacheOwner(userId: string | null): void;
  resetStore(cacheUserId?: string | null): void;
}

const EMPTY_PAGES: Page[] = [];
const EMPTY_MEMBERS: WorkspaceMember[] = [];

export function selectActiveSnapshot(state: WorkspaceState): WorkspaceSnapshot | null {
  if (!state.activeWorkspaceId) return null;
  return state.snapshotsByWorkspaceId[state.activeWorkspaceId] ?? null;
}

export function selectActiveWorkspace(state: WorkspaceState): Workspace | null {
  return selectActiveSnapshot(state)?.workspace ?? null;
}

export function selectActivePages(state: WorkspaceState): Page[] {
  return selectActiveSnapshot(state)?.pages ?? EMPTY_PAGES;
}

export function selectActiveMembers(state: WorkspaceState): WorkspaceMember[] {
  return selectActiveSnapshot(state)?.members ?? EMPTY_MEMBERS;
}

export function selectWorkspaceSnapshot(state: WorkspaceState, workspaceId: string | null): WorkspaceSnapshot | null {
  if (!workspaceId) return null;
  return state.snapshotsByWorkspaceId[workspaceId] ?? null;
}

function rebuildPageMetaFromSnapshot(
  existing: Record<string, Page>,
  workspaceId: string,
  pages: Page[],
): Record<string, Page> {
  // Remove old entries for this workspace, add new ones
  const next: Record<string, Page> = {};
  for (const [id, page] of Object.entries(existing)) {
    // Keep pages from other workspaces
    if (page.workspace_id !== workspaceId) {
      next[id] = page;
    }
  }
  // Also keep pages from other snapshots that may share workspace_id
  // (shouldn't happen, but defensive)
  for (const page of pages) {
    next[page.id] = page;
  }
  return next;
}

function scrubPageMetaForWorkspace(existing: Record<string, Page>, workspaceId: string): Record<string, Page> {
  const next: Record<string, Page> = {};
  for (const [id, page] of Object.entries(existing)) {
    if (page.workspace_id !== workspaceId) {
      next[id] = page;
    }
  }
  return next;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      memberWorkspaces: [],
      sharedInbox: [],
      snapshotsByWorkspaceId: {},
      pageMetaById: {},
      lastVisitedWorkspaceId: null,
      cacheUserId: null,

      activeWorkspaceId: null,
      activeAccessMode: null,
      activeRouteSource: null,

      setMemberWorkspaces(workspaces) {
        set({ memberWorkspaces: workspaces });
      },

      upsertMemberWorkspace(ws) {
        set((state) => {
          const exists = state.memberWorkspaces.some((w) => w.id === ws.id);
          return {
            memberWorkspaces: exists
              ? state.memberWorkspaces.map((w) => (w.id === ws.id ? ws : w))
              : [...state.memberWorkspaces, ws],
          };
        });
      },

      removeMemberWorkspace(workspaceId) {
        set((state) => ({
          memberWorkspaces: state.memberWorkspaces.filter((w) => w.id !== workspaceId),
        }));
      },

      setSharedInbox(items) {
        set({ sharedInbox: items });
      },

      replaceWorkspaceSnapshot(workspaceId, snapshot) {
        set((state) => {
          const snapshotsByWorkspaceId = {
            ...state.snapshotsByWorkspaceId,
            [workspaceId]: snapshot,
          };
          return {
            snapshotsByWorkspaceId,
            pageMetaById: rebuildPageMetaFromSnapshot(state.pageMetaById, workspaceId, snapshot.pages),
          };
        });
      },

      patchWorkspace(workspaceId, updates) {
        set((state) => {
          const snap = state.snapshotsByWorkspaceId[workspaceId];
          if (!snap) return state;
          return {
            snapshotsByWorkspaceId: {
              ...state.snapshotsByWorkspaceId,
              [workspaceId]: {
                ...snap,
                workspace: { ...snap.workspace, ...updates },
              },
            },
          };
        });
      },

      removeWorkspaceSnapshot(workspaceId) {
        set((state) => {
          const { [workspaceId]: _, ...rest } = state.snapshotsByWorkspaceId;
          return {
            snapshotsByWorkspaceId: rest,
            pageMetaById: scrubPageMetaForWorkspace(state.pageMetaById, workspaceId),
            lastVisitedWorkspaceId: state.lastVisitedWorkspaceId === workspaceId ? null : state.lastVisitedWorkspaceId,
          };
        });
      },

      addPageToSnapshot(workspaceId, page) {
        set((state) => {
          const snap = state.snapshotsByWorkspaceId[workspaceId];
          if (!snap) return state;
          return {
            snapshotsByWorkspaceId: {
              ...state.snapshotsByWorkspaceId,
              [workspaceId]: { ...snap, pages: [...snap.pages, page] },
            },
            pageMetaById: { ...state.pageMetaById, [page.id]: page },
          };
        });
      },

      updatePageInSnapshot(workspaceId, pageId, updates) {
        set((state) => {
          const snap = state.snapshotsByWorkspaceId[workspaceId];
          if (!snap) return state;
          const updatedPages = snap.pages.map((p) => (p.id === pageId ? { ...p, ...updates } : p));
          const updatedPage = updatedPages.find((p) => p.id === pageId);
          return {
            snapshotsByWorkspaceId: {
              ...state.snapshotsByWorkspaceId,
              [workspaceId]: { ...snap, pages: updatedPages },
            },
            pageMetaById: updatedPage ? { ...state.pageMetaById, [pageId]: updatedPage } : state.pageMetaById,
          };
        });
      },

      removePageFromSnapshot(workspaceId, pageId) {
        set((state) => {
          const snap = state.snapshotsByWorkspaceId[workspaceId];
          if (!snap) return state;
          const { [pageId]: _, ...restMeta } = state.pageMetaById;
          return {
            snapshotsByWorkspaceId: {
              ...state.snapshotsByWorkspaceId,
              [workspaceId]: { ...snap, pages: snap.pages.filter((p) => p.id !== pageId) },
            },
            pageMetaById: restMeta,
          };
        });
      },

      archivePageInSnapshot(workspaceId, pageId) {
        set((state) => {
          const snap = state.snapshotsByWorkspaceId[workspaceId];
          if (!snap) return state;
          const updatedPages = snap.pages
            .filter((p) => p.id !== pageId)
            .map((p) => (p.parent_id === pageId ? { ...p, parent_id: null } : p));
          const { [pageId]: _, ...restMeta } = state.pageMetaById;
          return {
            snapshotsByWorkspaceId: {
              ...state.snapshotsByWorkspaceId,
              [workspaceId]: { ...snap, pages: updatedPages },
            },
            pageMetaById: restMeta,
          };
        });
      },

      replaceSnapshotMembers(workspaceId, members) {
        set((state) => {
          const snap = state.snapshotsByWorkspaceId[workspaceId];
          if (!snap) return state;
          return {
            snapshotsByWorkspaceId: {
              ...state.snapshotsByWorkspaceId,
              [workspaceId]: { ...snap, members },
            },
          };
        });
      },

      setLastVisitedWorkspaceId(id) {
        set({ lastVisitedWorkspaceId: id });
      },

      setActiveRoute(workspaceId, accessMode, source) {
        set({ activeWorkspaceId: workspaceId, activeAccessMode: accessMode, activeRouteSource: source });
      },

      clearActiveRoute() {
        set({ activeWorkspaceId: null, activeAccessMode: null, activeRouteSource: null });
      },

      validateCacheOwner(userId) {
        const state = get();
        if (state.cacheUserId && state.cacheUserId !== userId) {
          clearAllCachedDocs();
          state.resetStore(userId);
        } else if (!state.cacheUserId && userId) {
          set({ cacheUserId: userId });
        }
      },

      resetStore(cacheUserId) {
        const nextState = {
          memberWorkspaces: [],
          sharedInbox: [],
          snapshotsByWorkspaceId: {},
          pageMetaById: {},
          lastVisitedWorkspaceId: null,
          activeWorkspaceId: null,
          activeAccessMode: null,
          activeRouteSource: null,
        };
        set(cacheUserId === undefined ? nextState : { ...nextState, cacheUserId });
      },
    }),
    {
      name: STORAGE_KEYS.WORKSPACE,
      version: 2,
      partialize: (state) => ({
        memberWorkspaces: state.memberWorkspaces,
        sharedInbox: state.sharedInbox,
        snapshotsByWorkspaceId: state.snapshotsByWorkspaceId,
        pageMetaById: state.pageMetaById,
        lastVisitedWorkspaceId: state.lastVisitedWorkspaceId,
        cacheUserId: state.cacheUserId,
      }),
    },
  ),
);
