import { db } from "./bland-db";

/**
 * Cascade-remove a workspace from every local table. Used for leave/delete
 * flows. Cross-store and transactional: directory + replica + pages +
 * members + page access (joined via workspacePages primary keys) +
 * lastVisitedPages + the `lastVisitedWorkspaceId` meta row when it points
 * at the removed workspace.
 */
async function removeWorkspace(workspaceId: string): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.memberWorkspaces,
      db.workspaceReplicas,
      db.workspacePages,
      db.workspaceMembers,
      db.pageAccess,
      db.lastVisitedPages,
      db.workspaceMeta,
    ],
    async () => {
      const pageIds = (await db.workspacePages.where("workspace_id").equals(workspaceId).primaryKeys()) as string[];

      await db.memberWorkspaces.delete(workspaceId);
      await db.workspaceReplicas.delete(workspaceId);
      await db.workspacePages.bulkDelete(pageIds);
      await db.workspaceMembers.where("workspace_id").equals(workspaceId).delete();
      if (pageIds.length > 0) {
        await db.pageAccess.bulkDelete(pageIds);
      }
      await db.lastVisitedPages.delete(workspaceId);
      const lv = await db.workspaceMeta.get("lastVisitedWorkspaceId");
      if (lv?.value === workspaceId) {
        await db.workspaceMeta.put({ key: "lastVisitedWorkspaceId", value: null });
      }
    },
  );
}

/**
 * Clear every local workspace table, preserving the `workspaceMeta` row
 * structure. The caller is responsible for writing the new `owner` value
 * after this completes. Used by owner-change and logout flows.
 */
async function clearAllLocal(): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.memberWorkspaces,
      db.workspaceReplicas,
      db.workspacePages,
      db.workspaceMembers,
      db.pageAccess,
      db.sharedInboxItems,
      db.sharedInboxWorkspaceSummaries,
      db.lastVisitedPages,
      db.workspaceMeta,
    ],
    async () => {
      await db.memberWorkspaces.clear();
      await db.workspaceReplicas.clear();
      await db.workspacePages.clear();
      await db.workspaceMembers.clear();
      await db.pageAccess.clear();
      await db.sharedInboxItems.clear();
      await db.sharedInboxWorkspaceSummaries.clear();
      await db.lastVisitedPages.clear();
      await db.workspaceMeta.put({ key: "lastVisitedWorkspaceId", value: null });
    },
  );
}

export const workspaceLifecycleCommands = {
  removeWorkspace,
  clearAllLocal,
};
