import type { Workspace, WorkspaceMembershipSummary } from "@/shared/types";
import { db, type MemberWorkspaceRow } from "./bland-db";

async function replaceAll(workspaces: WorkspaceMembershipSummary[]): Promise<void> {
  const rows: MemberWorkspaceRow[] = workspaces.map((ws, rank) => ({ ...ws, rank }));
  await db.transaction("rw", db.memberWorkspaces, async () => {
    await db.memberWorkspaces.clear();
    if (rows.length > 0) {
      await db.memberWorkspaces.bulkPut(rows);
    }
  });
}

async function upsert(workspace: WorkspaceMembershipSummary): Promise<void> {
  await db.transaction("rw", db.memberWorkspaces, async () => {
    const existing = await db.memberWorkspaces.get(workspace.id);
    if (existing) {
      await db.memberWorkspaces.put({ ...workspace, rank: existing.rank });
      return;
    }
    const tail = await db.memberWorkspaces.orderBy("rank").last();
    const rank = tail ? tail.rank + 1 : 0;
    await db.memberWorkspaces.put({ ...workspace, rank });
  });
}

async function patch(workspaceId: string, updates: Partial<Workspace>): Promise<void> {
  await db.transaction("rw", db.memberWorkspaces, async () => {
    const existing = await db.memberWorkspaces.get(workspaceId);
    if (!existing) return;
    // Preserve role + rank; only the plain Workspace shape is patched.
    await db.memberWorkspaces.put({
      ...existing,
      ...updates,
      id: existing.id,
      role: existing.role,
      rank: existing.rank,
    });
  });
}

async function remove(workspaceId: string): Promise<void> {
  await db.memberWorkspaces.delete(workspaceId);
}

export const directoryCommands = {
  replaceAll,
  upsert,
  patch,
  remove,
};
