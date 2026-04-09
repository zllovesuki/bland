import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Workspace, Page, WorkspaceMember } from "@/shared/types";
import { STORAGE_KEYS } from "@/client/lib/constants";
import { clearAllCachedDocs } from "@/client/lib/doc-cache-hints";

interface WorkspaceState {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  pages: Page[];
  members: WorkspaceMember[];
  accessMode: "member" | "shared" | null;
  cacheUserId: string | null;
  setWorkspaces(ws: Workspace[]): void;
  setCurrentWorkspace(ws: Workspace | null): void;
  setPages(pages: Page[]): void;
  setMembers(members: WorkspaceMember[]): void;
  setAccessMode(mode: "member" | "shared" | null): void;
  clearWorkspaceContext(): void;
  resetWorkspaceState(cacheUserId?: string | null): void;
  addWorkspace(ws: Workspace): void;
  addPage(page: Page): void;
  updatePage(id: string, updates: Partial<Page>): void;
  removePage(id: string): void;
  archivePage(id: string): void;
  validateCacheOwner(userId: string | null): void;
}

function getClearedWorkspaceContext() {
  return {
    currentWorkspace: null,
    pages: [],
    members: [],
    accessMode: null,
  };
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      ...getClearedWorkspaceContext(),
      cacheUserId: null as string | null,

      setWorkspaces(workspaces) {
        set({ workspaces });
      },

      setCurrentWorkspace(workspace) {
        set({ currentWorkspace: workspace });
      },

      setPages(pages) {
        set({ pages });
      },

      setMembers(members) {
        set({ members });
      },

      setAccessMode(mode) {
        set({ accessMode: mode });
      },

      clearWorkspaceContext() {
        set(getClearedWorkspaceContext());
      },

      resetWorkspaceState(cacheUserId) {
        const nextState = {
          workspaces: [],
          ...getClearedWorkspaceContext(),
        };
        set(cacheUserId === undefined ? nextState : { ...nextState, cacheUserId });
      },

      addWorkspace(ws) {
        set((state) => ({ workspaces: [...state.workspaces, ws] }));
      },

      addPage(page) {
        set((state) => ({ pages: [...state.pages, page] }));
      },

      updatePage(id, updates) {
        set((state) => ({
          pages: state.pages.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        }));
      },

      removePage(id) {
        set((state) => ({
          pages: state.pages.filter((p) => p.id !== id),
        }));
      },

      archivePage(id) {
        set((state) => ({
          pages: state.pages
            .filter((p) => p.id !== id)
            .map((p) => (p.parent_id === id ? { ...p, parent_id: null } : p)),
        }));
      },

      validateCacheOwner(userId) {
        const state = get();
        if (state.cacheUserId && state.cacheUserId !== userId) {
          clearAllCachedDocs();
          state.resetWorkspaceState(userId);
        } else if (!state.cacheUserId && userId) {
          set({ cacheUserId: userId });
        }
      },
    }),
    {
      name: STORAGE_KEYS.WORKSPACE,
      partialize: (state) => ({
        workspaces: state.workspaces,
        currentWorkspace: state.currentWorkspace,
        pages: state.pages,
        members: state.members,
        accessMode: state.accessMode,
        cacheUserId: state.cacheUserId,
      }),
    },
  ),
);
