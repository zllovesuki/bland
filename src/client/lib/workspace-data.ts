import { api } from "@/client/lib/api";
import type { Page, WorkspaceMember } from "@/shared/types";

export type WorkspaceAccessMode = "member" | "shared";

interface WorkspaceDataStore {
  setAccessMode(mode: WorkspaceAccessMode | null): void;
  setPages(pages: Page[]): void;
  setMembers(members: WorkspaceMember[]): void;
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
