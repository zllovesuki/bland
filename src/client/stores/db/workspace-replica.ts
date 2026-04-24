import type { Page, Workspace, WorkspaceMember, WorkspaceRole } from "@/shared/types";
import {
  db,
  type PageAccessMode,
  type WorkspaceAccessMode,
  type WorkspacePageRow,
  type WorkspaceReplicaRow,
} from "./bland-db";

interface ReplaceWorkspaceInput {
  workspace: Workspace;
  accessMode: WorkspaceAccessMode;
  workspaceRole: WorkspaceRole | null;
  pages: Page[];
  members: WorkspaceMember[];
}

function toReplicaRow(input: {
  workspace: Workspace;
  accessMode: WorkspaceAccessMode;
  workspaceRole: WorkspaceRole | null;
}): WorkspaceReplicaRow {
  return {
    id: input.workspace.id,
    slug: input.workspace.slug,
    workspace: input.workspace,
    accessMode: input.accessMode,
    workspaceRole: input.workspaceRole,
  };
}

async function replaceWorkspace(input: ReplaceWorkspaceInput): Promise<void> {
  const workspaceId = input.workspace.id;
  await db.transaction("rw", [db.workspaceReplicas, db.workspacePages, db.workspaceMembers], async () => {
    await db.workspaceReplicas.put(toReplicaRow(input));
    await db.workspacePages.where("workspace_id").equals(workspaceId).delete();
    if (input.pages.length > 0) {
      await db.workspacePages.bulkPut(input.pages);
    }
    await db.workspaceMembers.where("workspace_id").equals(workspaceId).delete();
    if (input.members.length > 0) {
      await db.workspaceMembers.bulkPut(input.members);
    }
  });
}

async function patchWorkspaceHead(workspaceId: string, updates: Partial<Workspace>): Promise<void> {
  await db.transaction("rw", db.workspaceReplicas, async () => {
    const existing = await db.workspaceReplicas.get(workspaceId);
    if (!existing) return;
    const nextWorkspace: Workspace = {
      ...existing.workspace,
      ...updates,
      id: existing.workspace.id,
    };
    await db.workspaceReplicas.put({
      ...existing,
      workspace: nextWorkspace,
      slug: nextWorkspace.slug,
    });
  });
}

async function replaceMembers(workspaceId: string, members: WorkspaceMember[]): Promise<void> {
  await db.transaction("rw", db.workspaceMembers, async () => {
    await db.workspaceMembers.where("workspace_id").equals(workspaceId).delete();
    if (members.length > 0) {
      await db.workspaceMembers.bulkPut(members);
    }
  });
}

async function addPage(_workspaceId: string, page: Page): Promise<void> {
  await db.workspacePages.put(page as WorkspacePageRow);
}

async function upsertPage(_workspaceId: string, page: Page): Promise<void> {
  await db.transaction("rw", db.workspacePages, async () => {
    const existing = await db.workspacePages.get(page.id);
    if (!existing) {
      await db.workspacePages.put(page as WorkspacePageRow);
      return;
    }
    await db.workspacePages.put({ ...existing, ...page });
  });
}

async function patchPage(_workspaceId: string, pageId: string, updates: Partial<Page>): Promise<void> {
  await db.transaction("rw", db.workspacePages, async () => {
    const existing = await db.workspacePages.get(pageId);
    if (!existing) return;
    await db.workspacePages.put({ ...existing, ...updates });
  });
}

async function removePage(_workspaceId: string, pageId: string): Promise<void> {
  await db.transaction("rw", [db.workspacePages, db.pageAccess], async () => {
    await db.workspacePages.delete(pageId);
    await db.pageAccess.delete(pageId);
  });
}

async function archivePage(workspaceId: string, pageId: string): Promise<void> {
  await db.transaction("rw", [db.workspacePages, db.pageAccess], async () => {
    const children = await db.workspacePages
      .where("workspace_id")
      .equals(workspaceId)
      .filter((p) => p.parent_id === pageId)
      .toArray();
    if (children.length > 0) {
      await db.workspacePages.bulkPut(children.map((c) => ({ ...c, parent_id: null })));
    }
    await db.workspacePages.delete(pageId);
    await db.pageAccess.delete(pageId);
  });
}

async function upsertPageAccess(pageId: string, mode: PageAccessMode): Promise<void> {
  await db.pageAccess.put({ pageId, mode });
}

async function removePageAccess(pageId: string): Promise<void> {
  await db.pageAccess.delete(pageId);
}

async function removeReplica(workspaceId: string): Promise<void> {
  await db.workspaceReplicas.delete(workspaceId);
}

export const replicaCommands = {
  replaceWorkspace,
  patchWorkspaceHead,
  replaceMembers,
  addPage,
  upsertPage,
  patchPage,
  removePage,
  archivePage,
  upsertPageAccess,
  removePageAccess,
  removeReplica,
};
