import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useMemo } from "react";
import type { Workspace, Page, WorkspaceMember, SharedWithMeItem } from "@/shared/types";
import { STORAGE_KEYS } from "@/client/lib/constants";
import { clearAllCachedDocs } from "@/client/lib/doc-cache-hints";
import {
  addSnapshotPage,
  archiveSnapshotPage,
  patchSnapshotPage,
  removeSnapshotPage,
  upsertSnapshotPage,
} from "@/client/lib/workspace-snapshot-pages";

export type WorkspaceAccessMode = "member" | "shared";

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
  lastVisitedWorkspaceId: string | null;
  cacheUserId: string | null;

  setMemberWorkspaces(ws: Workspace[]): void;
  upsertMemberWorkspace(ws: Workspace): void;
  removeMemberWorkspace(workspaceId: string): void;
  setSharedInbox(items: SharedWithMeItem[]): void;

  replaceWorkspaceSnapshot(workspaceId: string, snapshot: WorkspaceSnapshot): void;
  patchWorkspace(workspaceId: string, updates: Partial<Workspace>): void;
  removeWorkspaceSnapshot(workspaceId: string): void;

  addPageToSnapshot(workspaceId: string, page: Page): void;
  upsertPageInSnapshot(workspaceId: string, page: Page): void;
  updatePageInSnapshot(workspaceId: string, pageId: string, updates: Partial<Page>): void;
  removePageFromSnapshot(workspaceId: string, pageId: string): void;
  archivePageInSnapshot(workspaceId: string, pageId: string): void;
  replaceSnapshotMembers(workspaceId: string, members: WorkspaceMember[]): void;

  setLastVisitedWorkspaceId(id: string | null): void;

  validateCacheOwner(userId: string | null): void;
  resetStore(cacheUserId?: string | null): void;
}

export function selectWorkspaceSnapshot(state: WorkspaceState, workspaceId: string | null): WorkspaceSnapshot | null {
  if (!workspaceId) return null;
  return state.snapshotsByWorkspaceId[workspaceId] ?? null;
}

/**
 * Flatten every snapshot's pages into a `pageId -> Page` map. Derived; no
 * persisted state backs this. Callers who already know the workspace id
 * should prefer reading from the snapshot directly — this exists for
 * consumers that receive a bare page id (canonical cached-page lookup,
 * mention resolver cache reads).
 */
export function selectPageMetaById(state: WorkspaceState): Record<string, Page> {
  const out: Record<string, Page> = {};
  for (const snap of Object.values(state.snapshotsByWorkspaceId)) {
    for (const page of snap.pages) {
      out[page.id] = page;
    }
  }
  return out;
}

/**
 * Targeted `pageId -> Page | null` subscription. Returns null when no snapshot
 * contains the id. Uses referential equality on the snapshots map so the
 * subscriber re-renders only when the relevant page mutates.
 */
export function usePageMetaById(pageId: string | undefined | null): Page | null {
  const snapshots = useWorkspaceStore((s) => s.snapshotsByWorkspaceId);
  return useMemo(() => {
    if (!pageId) return null;
    for (const snap of Object.values(snapshots)) {
      const found = snap.pages.find((p) => p.id === pageId);
      if (found) return found;
    }
    return null;
  }, [snapshots, pageId]);
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      memberWorkspaces: [],
      sharedInbox: [],
      snapshotsByWorkspaceId: {},
      lastVisitedWorkspaceId: null,
      cacheUserId: null,

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
        set((state) => ({
          snapshotsByWorkspaceId: {
            ...state.snapshotsByWorkspaceId,
            [workspaceId]: snapshot,
          },
        }));
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
              [workspaceId]: addSnapshotPage(snap, page),
            },
          };
        });
      },

      upsertPageInSnapshot(workspaceId, page) {
        set((state) => {
          const snap = state.snapshotsByWorkspaceId[workspaceId];
          if (!snap) return state;
          return {
            snapshotsByWorkspaceId: {
              ...state.snapshotsByWorkspaceId,
              [workspaceId]: upsertSnapshotPage(snap, page),
            },
          };
        });
      },

      updatePageInSnapshot(workspaceId, pageId, updates) {
        set((state) => {
          const snap = state.snapshotsByWorkspaceId[workspaceId];
          if (!snap) return state;
          return {
            snapshotsByWorkspaceId: {
              ...state.snapshotsByWorkspaceId,
              [workspaceId]: patchSnapshotPage(snap, pageId, updates),
            },
          };
        });
      },

      removePageFromSnapshot(workspaceId, pageId) {
        set((state) => {
          const snap = state.snapshotsByWorkspaceId[workspaceId];
          if (!snap) return state;
          return {
            snapshotsByWorkspaceId: {
              ...state.snapshotsByWorkspaceId,
              [workspaceId]: removeSnapshotPage(snap, pageId),
            },
          };
        });
      },

      archivePageInSnapshot(workspaceId, pageId) {
        set((state) => {
          const snap = state.snapshotsByWorkspaceId[workspaceId];
          if (!snap) return state;
          return {
            snapshotsByWorkspaceId: {
              ...state.snapshotsByWorkspaceId,
              [workspaceId]: archiveSnapshotPage(snap, pageId),
            },
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
          lastVisitedWorkspaceId: null,
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
        lastVisitedWorkspaceId: state.lastVisitedWorkspaceId,
        cacheUserId: state.cacheUserId,
      }),
    },
  ),
);
