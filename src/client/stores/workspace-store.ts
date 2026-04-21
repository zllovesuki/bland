import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Workspace, Page, WorkspaceMember, SharedWithMeItem } from "@/shared/types";
import { STORAGE_KEYS } from "@/client/lib/constants";
import { docCache } from "@/client/lib/doc-cache-registry";
import { queryClient } from "@/client/lib/query-client";
import { safeJsonStorage } from "@/client/lib/storage";
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
  lastVisitedPageIdByWorkspaceId: Record<string, string>;
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
  setLastVisitedPage(workspaceId: string, pageId: string): void;

  validateCacheOwner(userId: string | null): void;
  resetStore(cacheUserId?: string | null): void;
}

export function selectWorkspaceSnapshot(state: WorkspaceState, workspaceId: string | null): WorkspaceSnapshot | null {
  if (!workspaceId) return null;
  return state.snapshotsByWorkspaceId[workspaceId] ?? null;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      memberWorkspaces: [],
      sharedInbox: [],
      snapshotsByWorkspaceId: {},
      lastVisitedWorkspaceId: null,
      lastVisitedPageIdByWorkspaceId: {},
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
          const { [workspaceId]: __, ...restLastPages } = state.lastVisitedPageIdByWorkspaceId;
          return {
            snapshotsByWorkspaceId: rest,
            lastVisitedWorkspaceId: state.lastVisitedWorkspaceId === workspaceId ? null : state.lastVisitedWorkspaceId,
            lastVisitedPageIdByWorkspaceId: restLastPages,
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

      setLastVisitedPage(workspaceId, pageId) {
        set((state) => {
          if (state.lastVisitedPageIdByWorkspaceId[workspaceId] === pageId) return state;
          return {
            lastVisitedPageIdByWorkspaceId: {
              ...state.lastVisitedPageIdByWorkspaceId,
              [workspaceId]: pageId,
            },
          };
        });
      },

      validateCacheOwner(userId) {
        const state = get();
        if (state.cacheUserId && state.cacheUserId !== userId) {
          docCache.clearAll();
          queryClient.clear();
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
          lastVisitedPageIdByWorkspaceId: {},
        };
        set(cacheUserId === undefined ? nextState : { ...nextState, cacheUserId });
      },
    }),
    {
      name: STORAGE_KEYS.WORKSPACE,
      version: 3,
      storage: safeJsonStorage,
      partialize: (state) => ({
        memberWorkspaces: state.memberWorkspaces,
        sharedInbox: state.sharedInbox,
        snapshotsByWorkspaceId: state.snapshotsByWorkspaceId,
        lastVisitedWorkspaceId: state.lastVisitedWorkspaceId,
        lastVisitedPageIdByWorkspaceId: state.lastVisitedPageIdByWorkspaceId,
        cacheUserId: state.cacheUserId,
      }),
    },
  ),
);
