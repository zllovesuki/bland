import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Workspace,
  WorkspaceMembershipSummary,
  WorkspaceRole,
  Page,
  WorkspaceMember,
  SharedWithMeItem,
  SharedInboxWorkspaceSummary,
} from "@/shared/types";
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

/** Page access level recorded alongside the cached page snapshot. Offline and
 *  degraded renderers read from this map so a previously view-only page does
 *  not get promoted to edit once the network drops. Keyed by page id (ULID,
 *  globally unique — no workspace tiering needed). */
export type CachedPageAccessMode = "view" | "edit";

export interface WorkspaceSnapshot {
  workspace: Workspace;
  accessMode: WorkspaceAccessMode;
  // Caller's role in this workspace as of the last bootstrap. `null` for
  // shared-surface snapshots (where no membership exists) and for canonical
  // snapshots where the caller does not have a membership row. Role-aware
  // affordance/entitlement derivation reads from here instead of scanning
  // `members`, which can be empty on shared-surface and guest-scoped views.
  workspaceRole: WorkspaceRole | null;
  pages: Page[];
  members: WorkspaceMember[];
}

interface WorkspaceState {
  memberWorkspaces: WorkspaceMembershipSummary[];
  sharedInbox: SharedWithMeItem[];
  sharedInboxWorkspaceSummaries: SharedInboxWorkspaceSummary[];
  snapshotsByWorkspaceId: Record<string, WorkspaceSnapshot>;
  pageAccessByPageId: Record<string, CachedPageAccessMode>;
  lastVisitedWorkspaceId: string | null;
  lastVisitedPageIdByWorkspaceId: Record<string, string>;
  cacheUserId: string | null;

  setMemberWorkspaces(ws: WorkspaceMembershipSummary[]): void;
  upsertMemberWorkspace(ws: WorkspaceMembershipSummary): void;
  patchMemberWorkspace(workspaceId: string, updates: Partial<Workspace>): void;
  removeMemberWorkspace(workspaceId: string): void;
  setSharedInbox(items: SharedWithMeItem[], summaries: SharedInboxWorkspaceSummary[]): void;

  replaceWorkspaceSnapshot(workspaceId: string, snapshot: WorkspaceSnapshot): void;
  patchWorkspace(workspaceId: string, updates: Partial<Workspace>): void;
  removeWorkspaceSnapshot(workspaceId: string): void;

  addPageToSnapshot(workspaceId: string, page: Page): void;
  upsertPageInSnapshot(workspaceId: string, page: Page): void;
  updatePageInSnapshot(workspaceId: string, pageId: string, updates: Partial<Page>): void;
  removePageFromSnapshot(workspaceId: string, pageId: string): void;
  archivePageInSnapshot(workspaceId: string, pageId: string): void;
  replaceSnapshotMembers(workspaceId: string, members: WorkspaceMember[]): void;

  upsertPageAccess(pageId: string, mode: CachedPageAccessMode): void;

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
      sharedInboxWorkspaceSummaries: [],
      snapshotsByWorkspaceId: {},
      pageAccessByPageId: {},
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

      patchMemberWorkspace(workspaceId, updates) {
        // Used when a Workspace PATCH response lacks the caller's role
        // (e.g. settings edits). Preserves the stored role instead of
        // overwriting with a plain `Workspace`.
        set((state) => ({
          memberWorkspaces: state.memberWorkspaces.map((w) =>
            w.id === workspaceId ? { ...w, ...updates, id: w.id, role: w.role } : w,
          ),
        }));
      },

      removeMemberWorkspace(workspaceId) {
        set((state) => ({
          memberWorkspaces: state.memberWorkspaces.filter((w) => w.id !== workspaceId),
        }));
      },

      setSharedInbox(items, summaries) {
        set({ sharedInbox: items, sharedInboxWorkspaceSummaries: summaries });
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

      upsertPageAccess(pageId, mode) {
        set((state) => {
          if (state.pageAccessByPageId[pageId] === mode) return state;
          return {
            pageAccessByPageId: { ...state.pageAccessByPageId, [pageId]: mode },
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
          sharedInboxWorkspaceSummaries: [],
          snapshotsByWorkspaceId: {},
          pageAccessByPageId: {},
          lastVisitedWorkspaceId: null,
          lastVisitedPageIdByWorkspaceId: {},
        };
        set(cacheUserId === undefined ? nextState : { ...nextState, cacheUserId });
      },
    }),
    {
      name: STORAGE_KEYS.WORKSPACE,
      version: 6,
      storage: safeJsonStorage,
      partialize: (state) => ({
        memberWorkspaces: state.memberWorkspaces,
        sharedInbox: state.sharedInbox,
        sharedInboxWorkspaceSummaries: state.sharedInboxWorkspaceSummaries,
        snapshotsByWorkspaceId: state.snapshotsByWorkspaceId,
        pageAccessByPageId: state.pageAccessByPageId,
        lastVisitedWorkspaceId: state.lastVisitedWorkspaceId,
        lastVisitedPageIdByWorkspaceId: state.lastVisitedPageIdByWorkspaceId,
        cacheUserId: state.cacheUserId,
      }),
      // v3 -> v4: default snapshot pages without `kind` to "doc".
      // v4 -> v5: seed the `pageAccessByPageId` map so offline renderers
      //           fail closed to "view" when the access mode is unknown.
      // v5 -> v6: persisted snapshots below v6 lack `workspaceRole` and may
      //           carry stale `accessMode: "member"` values for guest
      //           workspaces. v5 state cannot be upgraded deterministically,
      //           so this step drops `snapshotsByWorkspaceId`,
      //           `memberWorkspaces`, `lastVisitedWorkspaceId`, and
      //           `lastVisitedPageIdByWorkspaceId`; the next navigation
      //           re-bootstraps them from the server with a
      //           `workspace_role`-aware `ResolvedViewerContext`. When the
      //           first root hit lands offline, `resolveRootWorkspaceDecision`
      //           yields the existing "Couldn't load your workspaces" UI.
      migrate: (persisted, from) => {
        const state = persisted as Partial<WorkspaceState> | undefined;
        if (!state) return state as unknown as WorkspaceState;
        let next = state;
        if (from < 4) {
          const snapshotsByWorkspaceId = next.snapshotsByWorkspaceId ?? {};
          const migratedSnapshots: Record<string, WorkspaceSnapshot> = {};
          for (const [wsId, snap] of Object.entries(snapshotsByWorkspaceId)) {
            migratedSnapshots[wsId] = {
              ...snap,
              pages: snap.pages.map((p) => (p.kind ? p : { ...p, kind: "doc" as const })),
            };
          }
          next = { ...next, snapshotsByWorkspaceId: migratedSnapshots };
        }
        if (from < 5) {
          next = {
            ...next,
            pageAccessByPageId: next.pageAccessByPageId ?? {},
            sharedInboxWorkspaceSummaries: next.sharedInboxWorkspaceSummaries ?? [],
          };
        }
        if (from < 6) {
          next = {
            ...next,
            snapshotsByWorkspaceId: {},
            memberWorkspaces: [],
            lastVisitedWorkspaceId: null,
            lastVisitedPageIdByWorkspaceId: {},
          };
        }
        return next as WorkspaceState;
      },
    },
  ),
);
