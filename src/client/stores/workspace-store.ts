import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Workspace, Page, WorkspaceMember, SharedWithMeItem } from "@/shared/types";
import { STORAGE_KEYS } from "@/client/lib/constants";
import { clearAllCachedDocs } from "@/client/lib/doc-cache-hints";

export type WorkspaceAccessMode = "member" | "shared";

export interface WorkspaceSnapshot {
  workspace: Workspace;
  accessMode: WorkspaceAccessMode;
  pages: Page[];
  members: WorkspaceMember[];
}

interface WorkspaceState {
  // --- Persisted cache slice ---
  memberWorkspaces: Workspace[];
  sharedInbox: SharedWithMeItem[];
  snapshotsByWorkspaceId: Record<string, WorkspaceSnapshot>;
  pageMetaById: Record<string, Page>;
  lastVisitedWorkspaceId: string | null;
  cacheUserId: string | null;

  // --- Volatile route slice (NOT persisted) ---
  activeWorkspaceId: string | null;
  activeAccessMode: WorkspaceAccessMode | null;

  // --- Cache mutations ---
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

  // --- Route slice ---
  setActiveRoute(workspaceId: string, accessMode: WorkspaceAccessMode): void;
  clearActiveRoute(): void;

  // --- Lifecycle ---
  validateCacheOwner(userId: string | null): void;
  resetStore(cacheUserId?: string | null): void;
}

// --- Selectors ---

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

// --- Helpers ---

function buildPageMetaById(snapshots: Record<string, WorkspaceSnapshot>): Record<string, Page> {
  const index: Record<string, Page> = {};
  for (const snap of Object.values(snapshots)) {
    for (const page of snap.pages) {
      index[page.id] = page;
    }
  }
  return index;
}

function rebuildPageMetaFromSnapshot(
  existing: Record<string, Page>,
  workspaceId: string,
  pages: Page[],
  allSnapshots: Record<string, WorkspaceSnapshot>,
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

// --- v1 -> v2 migration ---

interface V1State {
  workspaces?: Workspace[];
  currentWorkspace?: Workspace | null;
  pages?: Page[];
  members?: WorkspaceMember[];
  accessMode?: "member" | "shared" | null;
  sharedInbox?: SharedWithMeItem[];
  cacheUserId?: string | null;
}

function migrateV1ToV2(persisted: V1State): Partial<WorkspaceState> {
  const snapshotsByWorkspaceId: Record<string, WorkspaceSnapshot> = {};
  const pageMetaById: Record<string, Page> = {};
  let lastVisitedWorkspaceId: string | null = null;

  if (persisted.currentWorkspace) {
    const wsId = persisted.currentWorkspace.id;
    lastVisitedWorkspaceId = wsId;
    snapshotsByWorkspaceId[wsId] = {
      workspace: persisted.currentWorkspace,
      accessMode: persisted.accessMode === "shared" ? "shared" : "member",
      pages: persisted.pages ?? [],
      members: persisted.members ?? [],
    };
    for (const page of persisted.pages ?? []) {
      pageMetaById[page.id] = page;
    }
  }

  return {
    memberWorkspaces: persisted.workspaces ?? [],
    sharedInbox: persisted.sharedInbox ?? [],
    snapshotsByWorkspaceId,
    pageMetaById,
    lastVisitedWorkspaceId,
    cacheUserId: persisted.cacheUserId ?? null,
  };
}

// --- Store ---

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      // Cache slice defaults
      memberWorkspaces: [],
      sharedInbox: [],
      snapshotsByWorkspaceId: {},
      pageMetaById: {},
      lastVisitedWorkspaceId: null,
      cacheUserId: null,

      // Route slice defaults
      activeWorkspaceId: null,
      activeAccessMode: null,

      // --- Cache mutations ---

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
            pageMetaById: rebuildPageMetaFromSnapshot(
              state.pageMetaById,
              workspaceId,
              snapshot.pages,
              snapshotsByWorkspaceId,
            ),
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

      // --- Route slice ---

      setActiveRoute(workspaceId, accessMode) {
        set({ activeWorkspaceId: workspaceId, activeAccessMode: accessMode });
      },

      clearActiveRoute() {
        set({ activeWorkspaceId: null, activeAccessMode: null });
      },

      // --- Lifecycle ---

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
        };
        set(cacheUserId === undefined ? nextState : { ...nextState, cacheUserId });
      },
    }),
    {
      name: STORAGE_KEYS.WORKSPACE,
      version: 2,
      migrate(persisted, version) {
        if (version < 2) {
          return migrateV1ToV2(persisted as V1State) as WorkspaceState;
        }
        return persisted as WorkspaceState;
      },
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
