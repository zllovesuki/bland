import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFreshDb, deleteDb } from "@tests/client/util/idb";
import type { BlandDatabase } from "@/client/stores/db/bland-db";

let db: BlandDatabase;
let navigationCommands: typeof import("@/client/stores/db/workspace-navigation").navigationCommands;

beforeEach(async () => {
  vi.resetModules();
  db = createFreshDb();
  vi.doMock("@/client/stores/db/bland-db", async () => {
    const actual = await vi.importActual<typeof import("@/client/stores/db/bland-db")>("@/client/stores/db/bland-db");
    return { ...actual, db };
  });
  navigationCommands = (await import("@/client/stores/db/workspace-navigation")).navigationCommands;
});

afterEach(async () => {
  await deleteDb(db);
  vi.restoreAllMocks();
});

describe("navigationCommands", () => {
  it("setLastVisitedWorkspaceId upserts the key/value meta row", async () => {
    await navigationCommands.setLastVisitedWorkspaceId("ws-1");
    expect((await db.workspaceMeta.get("lastVisitedWorkspaceId"))?.value).toBe("ws-1");
    await navigationCommands.setLastVisitedWorkspaceId("ws-2");
    expect((await db.workspaceMeta.get("lastVisitedWorkspaceId"))?.value).toBe("ws-2");
    await navigationCommands.setLastVisitedWorkspaceId(null);
    expect((await db.workspaceMeta.get("lastVisitedWorkspaceId"))?.value).toBeNull();
  });

  it("setLastVisitedPage writes one row per workspace", async () => {
    await navigationCommands.setLastVisitedPage("ws-1", "p1");
    await navigationCommands.setLastVisitedPage("ws-2", "pA");
    expect((await db.lastVisitedPages.get("ws-1"))?.pageId).toBe("p1");
    expect((await db.lastVisitedPages.get("ws-2"))?.pageId).toBe("pA");

    await navigationCommands.setLastVisitedPage("ws-1", "p2");
    expect((await db.lastVisitedPages.get("ws-1"))?.pageId).toBe("p2");
    expect((await db.lastVisitedPages.get("ws-2"))?.pageId).toBe("pA");
  });

  it("clearForWorkspace drops the lastVisitedPages row and clears the meta pointer when it matches", async () => {
    await navigationCommands.setLastVisitedWorkspaceId("ws-1");
    await navigationCommands.setLastVisitedPage("ws-1", "p1");
    await navigationCommands.setLastVisitedPage("ws-2", "pA");

    await navigationCommands.clearForWorkspace("ws-1");

    expect(await db.lastVisitedPages.get("ws-1")).toBeUndefined();
    expect((await db.lastVisitedPages.get("ws-2"))?.pageId).toBe("pA");
    expect((await db.workspaceMeta.get("lastVisitedWorkspaceId"))?.value).toBeNull();
  });

  it("clearForWorkspace preserves the meta pointer when it targets a different workspace", async () => {
    await navigationCommands.setLastVisitedWorkspaceId("ws-2");
    await navigationCommands.setLastVisitedPage("ws-1", "p1");
    await navigationCommands.clearForWorkspace("ws-1");
    expect((await db.workspaceMeta.get("lastVisitedWorkspaceId"))?.value).toBe("ws-2");
  });
});
