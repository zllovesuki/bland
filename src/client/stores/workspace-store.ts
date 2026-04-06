import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Workspace, Page, WorkspaceMember } from "@/shared/types";

interface WorkspaceState {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  pages: Page[];
  members: WorkspaceMember[];
  setWorkspaces(ws: Workspace[]): void;
  setCurrentWorkspace(ws: Workspace): void;
  setPages(pages: Page[]): void;
  setMembers(members: WorkspaceMember[]): void;
  addWorkspace(ws: Workspace): void;
  addPage(page: Page): void;
  updatePage(id: string, updates: Partial<Page>): void;
  removePage(id: string): void;
  archivePage(id: string): void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      workspaces: [],
      currentWorkspace: null,
      pages: [],
      members: [],

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
    }),
    {
      name: "bland:workspace",
      partialize: (state) => ({
        workspaces: state.workspaces,
        currentWorkspace: state.currentWorkspace,
      }),
    },
  ),
);
