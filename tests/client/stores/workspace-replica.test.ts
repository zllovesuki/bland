import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFreshDb, deleteDb } from "@tests/client/util/idb";
import { createMember, createPage, createWorkspace } from "@tests/client/util/fixtures";
import type { BlandDatabase } from "@/client/stores/db/bland-db";

let db: BlandDatabase;
let replicaCommands: typeof import("@/client/stores/db/workspace-replica").replicaCommands;

beforeEach(async () => {
  vi.resetModules();
  db = createFreshDb();
  vi.doMock("@/client/stores/db/bland-db", async () => {
    const actual = await vi.importActual<typeof import("@/client/stores/db/bland-db")>("@/client/stores/db/bland-db");
    return { ...actual, db };
  });
  const mod = await import("@/client/stores/db/workspace-replica");
  replicaCommands = mod.replicaCommands;
});

afterEach(async () => {
  await deleteDb(db);
  vi.restoreAllMocks();
});

describe("replicaCommands.replaceWorkspace", () => {
  it("stores the workspace head plus its pages and members in one transaction", async () => {
    const workspace = createWorkspace({ id: "ws-1", slug: "team" });
    const pages = [createPage({ id: "p1", workspace_id: "ws-1" })];
    const members = [createMember({ workspace_id: "ws-1" })];

    await replicaCommands.replaceWorkspace({
      workspace,
      accessMode: "member",
      workspaceRole: "member",
      pages,
      members,
    });

    expect(await db.workspaceReplicas.get("ws-1")).toMatchObject({
      id: "ws-1",
      slug: "team",
      accessMode: "member",
      workspaceRole: "member",
    });
    expect(await db.workspacePages.toArray()).toEqual(pages);
    expect(await db.workspaceMembers.toArray()).toEqual(members);
  });

  it("replaces prior pages and members scoped to the same workspace", async () => {
    const workspace = createWorkspace({ id: "ws-1" });
    const page1 = createPage({ id: "p1", workspace_id: "ws-1" });
    const page2 = createPage({ id: "p2", workspace_id: "ws-1" });

    await replicaCommands.replaceWorkspace({
      workspace,
      accessMode: "member",
      workspaceRole: "member",
      pages: [page1, page2],
      members: [],
    });
    await replicaCommands.replaceWorkspace({
      workspace,
      accessMode: "member",
      workspaceRole: "member",
      pages: [page2],
      members: [],
    });

    const remaining = await db.workspacePages.toArray();
    expect(remaining.map((p) => p.id)).toEqual(["p2"]);
  });

  it("does not disturb pages or members in other workspaces", async () => {
    const wsA = createWorkspace({ id: "ws-a" });
    const wsB = createWorkspace({ id: "ws-b" });
    await replicaCommands.replaceWorkspace({
      workspace: wsA,
      accessMode: "member",
      workspaceRole: "member",
      pages: [createPage({ id: "pa", workspace_id: "ws-a" })],
      members: [createMember({ workspace_id: "ws-a", user_id: "u-a" })],
    });
    await replicaCommands.replaceWorkspace({
      workspace: wsB,
      accessMode: "member",
      workspaceRole: "member",
      pages: [createPage({ id: "pb", workspace_id: "ws-b" })],
      members: [createMember({ workspace_id: "ws-b", user_id: "u-b" })],
    });

    await replicaCommands.replaceWorkspace({
      workspace: wsB,
      accessMode: "member",
      workspaceRole: "member",
      pages: [],
      members: [],
    });

    expect((await db.workspacePages.toArray()).map((p) => p.id)).toEqual(["pa"]);
    expect((await db.workspaceMembers.toArray()).map((m) => m.user_id)).toEqual(["u-a"]);
  });
});

describe("replicaCommands.archivePage", () => {
  it("promotes children to root, deletes the parent, and drops its pageAccess row", async () => {
    const workspace = createWorkspace({ id: "ws-1" });
    const parent = createPage({ id: "parent", workspace_id: "ws-1", parent_id: null });
    const child = createPage({ id: "child", workspace_id: "ws-1", parent_id: "parent" });
    const sibling = createPage({ id: "sibling", workspace_id: "ws-1", parent_id: null });

    await replicaCommands.replaceWorkspace({
      workspace,
      accessMode: "member",
      workspaceRole: "member",
      pages: [parent, child, sibling],
      members: [],
    });
    await replicaCommands.upsertPageAccess("parent", "edit");

    await replicaCommands.archivePage("ws-1", "parent");

    const remaining = await db.workspacePages.toArray();
    expect(remaining.find((p) => p.id === "parent")).toBeUndefined();
    expect(remaining.find((p) => p.id === "child")?.parent_id).toBeNull();
    expect(remaining.find((p) => p.id === "sibling")?.parent_id).toBeNull();
    expect(await db.pageAccess.get("parent")).toBeUndefined();
  });
});

describe("replicaCommands.patchWorkspaceHead", () => {
  it("merges plain Workspace updates without dropping viewer-scoped role / access", async () => {
    const workspace = createWorkspace({ id: "ws-1", name: "Old", slug: "old-slug" });
    await replicaCommands.replaceWorkspace({
      workspace,
      accessMode: "member",
      workspaceRole: "guest",
      pages: [],
      members: [],
    });

    await replicaCommands.patchWorkspaceHead("ws-1", { name: "New", slug: "new-slug" });

    const replica = await db.workspaceReplicas.get("ws-1");
    expect(replica?.workspace.name).toBe("New");
    expect(replica?.workspace.slug).toBe("new-slug");
    expect(replica?.slug).toBe("new-slug");
    expect(replica?.workspaceRole).toBe("guest");
    expect(replica?.accessMode).toBe("member");
  });
});

describe("replicaCommands.removePage", () => {
  it("removes the page row and any matching pageAccess row", async () => {
    await replicaCommands.replaceWorkspace({
      workspace: createWorkspace({ id: "ws-1" }),
      accessMode: "member",
      workspaceRole: "member",
      pages: [createPage({ id: "p1", workspace_id: "ws-1" })],
      members: [],
    });
    await replicaCommands.upsertPageAccess("p1", "view");

    await replicaCommands.removePage("ws-1", "p1");

    expect(await db.workspacePages.get("p1")).toBeUndefined();
    expect(await db.pageAccess.get("p1")).toBeUndefined();
  });
});

describe("replicaCommands.upsertPageAccess", () => {
  it("writes and overwrites the mode for a page id", async () => {
    await replicaCommands.upsertPageAccess("p1", "view");
    expect((await db.pageAccess.get("p1"))?.mode).toBe("view");
    await replicaCommands.upsertPageAccess("p1", "edit");
    expect((await db.pageAccess.get("p1"))?.mode).toBe("edit");
  });
});
