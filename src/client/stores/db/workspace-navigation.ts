import { db } from "./bland-db";

async function setLastVisitedWorkspaceId(workspaceId: string | null): Promise<void> {
  await db.workspaceMeta.put({ key: "lastVisitedWorkspaceId", value: workspaceId });
}

async function setLastVisitedPage(workspaceId: string, pageId: string): Promise<void> {
  await db.lastVisitedPages.put({ workspaceId, pageId });
}

async function clearForWorkspace(workspaceId: string): Promise<void> {
  await db.transaction("rw", [db.lastVisitedPages, db.workspaceMeta], async () => {
    await db.lastVisitedPages.delete(workspaceId);
    const current = await db.workspaceMeta.get("lastVisitedWorkspaceId");
    if (current?.value === workspaceId) {
      await db.workspaceMeta.put({ key: "lastVisitedWorkspaceId", value: null });
    }
  });
}

export const navigationCommands = {
  setLastVisitedWorkspaceId,
  setLastVisitedPage,
  clearForWorkspace,
};
