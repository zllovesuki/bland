import { api } from "@/client/lib/api";
import type { Page, Workspace, WorkspaceMember } from "@/shared/types";

export type WorkspaceAccessMode = "member" | "shared";

interface WorkspaceDataStore {
  setAccessMode(mode: WorkspaceAccessMode | null): void;
  setPages(pages: Page[]): void;
  setMembers(members: WorkspaceMember[]): void;
}

interface WorkspaceRouteStore extends WorkspaceDataStore {
  accessMode: WorkspaceAccessMode | null;
  workspaces: Workspace[];
  setWorkspaces(workspaces: Workspace[]): void;
  setCurrentWorkspace(workspace: Workspace | null): void;
  clearWorkspaceContext(): void;
}

export async function bootstrapWorkspaceData(
  store: WorkspaceDataStore,
  workspaceId: string,
  accessMode: WorkspaceAccessMode,
  shouldSkipApply?: () => boolean,
) {
  store.setAccessMode(accessMode);
  if (accessMode === "shared") {
    const pages = await api.pages.list(workspaceId);
    if (shouldSkipApply?.()) return;
    store.setPages(pages);
    store.setMembers([]);
    return;
  }

  const [pages, members] = await Promise.all([api.pages.list(workspaceId), api.workspaces.members(workspaceId)]);
  if (shouldSkipApply?.()) return;
  store.setPages(pages);
  store.setMembers(members);
}

export async function loadWorkspaceRouteData(
  store: WorkspaceRouteStore,
  slug: string,
  isAuthenticated: boolean,
): Promise<void> {
  let workspaces = store.workspaces;
  let gotRemoteResponse = false;
  try {
    workspaces = await api.workspaces.list();
    store.setWorkspaces(workspaces);
    gotRemoteResponse = true;
  } catch {
    // Fall back to cached list
  }

  const workspace = workspaces.find((w) => w.slug === slug);
  if (workspace) {
    store.setCurrentWorkspace(workspace);
    try {
      await bootstrapWorkspaceData(store, workspace.id, "member");
    } catch {
      // Component handles empty state
    }
  } else if (gotRemoteResponse && isAuthenticated) {
    store.clearWorkspaceContext();
  }
}

export async function loadPageRouteData(
  store: WorkspaceRouteStore,
  workspaceSlug: string,
  pageId: string,
): Promise<{ canonicalWorkspaceSlug?: string }> {
  if (store.accessMode !== null) return {};

  const ctx = await api.pages.context(pageId);
  store.setCurrentWorkspace(ctx.workspace);
  await bootstrapWorkspaceData(store, ctx.workspace.id, ctx.access_mode);

  if (ctx.workspace.slug !== workspaceSlug) {
    return { canonicalWorkspaceSlug: ctx.workspace.slug };
  }
  return {};
}
