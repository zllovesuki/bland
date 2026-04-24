import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFreshDb, deleteDb } from "@tests/client/util/idb";
import { createMember, createMembershipSummary, createPage, createWorkspace } from "@tests/client/util/fixtures";
import type { BlandDatabase } from "@/client/stores/db/bland-db";

let db: BlandDatabase;
let replicaCommands: typeof import("@/client/stores/db/workspace-replica").replicaCommands;
let directoryCommands: typeof import("@/client/stores/db/workspace-directory").directoryCommands;
let navigationCommands: typeof import("@/client/stores/db/workspace-navigation").navigationCommands;
let workspaceLifecycleCommands: typeof import("@/client/stores/db/workspace-lifecycle").workspaceLifecycleCommands;

beforeEach(async () => {
  vi.resetModules();
  db = createFreshDb();
  vi.doMock("@/client/stores/db/bland-db", async () => {
    const actual = await vi.importActual<typeof import("@/client/stores/db/bland-db")>("@/client/stores/db/bland-db");
    return { ...actual, db };
  });
  replicaCommands = (await import("@/client/stores/db/workspace-replica")).replicaCommands;
  directoryCommands = (await import("@/client/stores/db/workspace-directory")).directoryCommands;
  navigationCommands = (await import("@/client/stores/db/workspace-navigation")).navigationCommands;
  workspaceLifecycleCommands = (await import("@/client/stores/db/workspace-lifecycle")).workspaceLifecycleCommands;
});

afterEach(async () => {
  await deleteDb(db);
  vi.restoreAllMocks();
});

describe("workspaceLifecycleCommands.removeWorkspace", () => {
  async function seedTwoWorkspaces() {
    const target = createMembershipSummary({ id: "ws-1", slug: "one" });
    const other = createMembershipSummary({ id: "ws-2", slug: "two" });
    await directoryCommands.replaceAll([target, other]);

    await replicaCommands.replaceWorkspace({
      workspace: createWorkspace({ id: "ws-1" }),
      accessMode: "member",
      workspaceRole: "member",
      pages: [createPage({ id: "p1", workspace_id: "ws-1" }), createPage({ id: "p2", workspace_id: "ws-1" })],
      members: [createMember({ workspace_id: "ws-1" })],
    });
    await replicaCommands.replaceWorkspace({
      workspace: createWorkspace({ id: "ws-2" }),
      accessMode: "member",
      workspaceRole: "member",
      pages: [createPage({ id: "p3", workspace_id: "ws-2" })],
      members: [createMember({ workspace_id: "ws-2", user_id: "u-other" })],
    });
    await replicaCommands.upsertPageAccess("p1", "edit");
    await replicaCommands.upsertPageAccess("p2", "view");
    await replicaCommands.upsertPageAccess("p3", "edit");

    await navigationCommands.setLastVisitedWorkspaceId("ws-1");
    await navigationCommands.setLastVisitedPage("ws-1", "p1");
    await navigationCommands.setLastVisitedPage("ws-2", "p3");
  }

  it("cascades across directory, replica, pages, members, pageAccess, and lastVisitedPages", async () => {
    await seedTwoWorkspaces();

    await workspaceLifecycleCommands.removeWorkspace("ws-1");

    expect(await db.memberWorkspaces.get("ws-1")).toBeUndefined();
    expect(await db.workspaceReplicas.get("ws-1")).toBeUndefined();
    expect(await db.workspacePages.where("workspace_id").equals("ws-1").count()).toBe(0);
    expect(await db.workspaceMembers.where("workspace_id").equals("ws-1").count()).toBe(0);
    expect(await db.pageAccess.get("p1")).toBeUndefined();
    expect(await db.pageAccess.get("p2")).toBeUndefined();
    expect(await db.lastVisitedPages.get("ws-1")).toBeUndefined();
  });

  it("clears lastVisitedWorkspaceId when it matches the removed workspace", async () => {
    await seedTwoWorkspaces();
    await workspaceLifecycleCommands.removeWorkspace("ws-1");
    const lv = await db.workspaceMeta.get("lastVisitedWorkspaceId");
    expect(lv?.value).toBeNull();
  });

  it("preserves lastVisitedWorkspaceId when another workspace was the target", async () => {
    await seedTwoWorkspaces();
    await workspaceLifecycleCommands.removeWorkspace("ws-2");
    const lv = await db.workspaceMeta.get("lastVisitedWorkspaceId");
    expect(lv?.value).toBe("ws-1");
  });

  it("leaves other workspaces' pages, members, and pageAccess intact", async () => {
    await seedTwoWorkspaces();
    await workspaceLifecycleCommands.removeWorkspace("ws-1");
    expect(await db.workspaceReplicas.get("ws-2")).toBeDefined();
    expect(await db.workspacePages.get("p3")).toBeDefined();
    expect((await db.workspaceMembers.where("workspace_id").equals("ws-2").toArray()).length).toBe(1);
    expect((await db.pageAccess.get("p3"))?.mode).toBe("edit");
    expect(await db.lastVisitedPages.get("ws-2")).toBeDefined();
  });
});

describe("workspaceLifecycleCommands.clearAllLocal", () => {
  it("wipes every workspace-scoped table and resets lastVisitedWorkspaceId but keeps the meta row structure", async () => {
    await directoryCommands.replaceAll([createMembershipSummary({ id: "ws-1" })]);
    await replicaCommands.replaceWorkspace({
      workspace: createWorkspace({ id: "ws-1" }),
      accessMode: "member",
      workspaceRole: "member",
      pages: [createPage({ id: "p1", workspace_id: "ws-1" })],
      members: [createMember({ workspace_id: "ws-1" })],
    });
    await replicaCommands.upsertPageAccess("p1", "edit");
    await navigationCommands.setLastVisitedWorkspaceId("ws-1");
    await navigationCommands.setLastVisitedPage("ws-1", "p1");
    await db.workspaceMeta.put({ key: "owner", value: "user-1" });

    await workspaceLifecycleCommands.clearAllLocal();

    expect(await db.memberWorkspaces.count()).toBe(0);
    expect(await db.workspaceReplicas.count()).toBe(0);
    expect(await db.workspacePages.count()).toBe(0);
    expect(await db.workspaceMembers.count()).toBe(0);
    expect(await db.pageAccess.count()).toBe(0);
    expect(await db.sharedInboxItems.count()).toBe(0);
    expect(await db.lastVisitedPages.count()).toBe(0);
    // owner row is NOT touched by clearAllLocal; the caller
    // (ensureWorkspaceLocalOwner / resetWorkspaceLocalOwner) writes the new
    // owner value separately.
    expect((await db.workspaceMeta.get("owner"))?.value).toBe("user-1");
    expect((await db.workspaceMeta.get("lastVisitedWorkspaceId"))?.value).toBeNull();
  });
});
