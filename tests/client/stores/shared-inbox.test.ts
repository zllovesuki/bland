import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFreshDb, deleteDb } from "@tests/client/util/idb";
import type { BlandDatabase } from "@/client/stores/db/bland-db";
import type { SharedInboxWorkspaceSummary, SharedWithMeItem } from "@/shared/types";

let db: BlandDatabase;
let sharedInboxCommands: typeof import("@/client/stores/db/shared-inbox").sharedInboxCommands;

const ITEM_ONE: SharedWithMeItem = {
  page_id: "p1",
  title: "One",
  icon: null,
  cover_url: null,
  workspace: { id: "ws-1", name: "W1", slug: "w1", icon: null, role: null },
  permission: "view",
  shared_by: "u2",
  shared_by_name: "Alice",
  shared_at: "2026-04-01T00:00:00.000Z",
};

const ITEM_TWO: SharedWithMeItem = {
  ...ITEM_ONE,
  page_id: "p2",
  title: "Two",
};

const SUMMARY: SharedInboxWorkspaceSummary = {
  workspace: { id: "ws-1", name: "W1", slug: "w1", icon: null },
  count: 2,
};

beforeEach(async () => {
  vi.resetModules();
  db = createFreshDb();
  vi.doMock("@/client/stores/db/bland-db", async () => {
    const actual = await vi.importActual<typeof import("@/client/stores/db/bland-db")>("@/client/stores/db/bland-db");
    return { ...actual, db };
  });
  sharedInboxCommands = (await import("@/client/stores/db/shared-inbox")).sharedInboxCommands;
});

afterEach(async () => {
  await deleteDb(db);
  vi.restoreAllMocks();
});

describe("sharedInboxCommands.replaceAll", () => {
  it("stores items and workspace summaries", async () => {
    await sharedInboxCommands.replaceAll({
      items: [ITEM_ONE, ITEM_TWO],
      workspaceSummaries: [SUMMARY],
    });

    const items = await db.sharedInboxItems.toArray();
    expect(items.map((r) => r.pageId).sort()).toEqual(["p1", "p2"]);
    const summaries = await db.sharedInboxWorkspaceSummaries.toArray();
    expect(summaries.map((r) => r.workspaceId)).toEqual(["ws-1"]);
  });

  it("replaces prior rows on each call", async () => {
    await sharedInboxCommands.replaceAll({ items: [ITEM_ONE, ITEM_TWO], workspaceSummaries: [SUMMARY] });
    await sharedInboxCommands.replaceAll({ items: [ITEM_ONE], workspaceSummaries: [] });
    expect((await db.sharedInboxItems.toArray()).map((r) => r.pageId)).toEqual(["p1"]);
    expect(await db.sharedInboxWorkspaceSummaries.count()).toBe(0);
  });

  it("empty input clears both tables", async () => {
    await sharedInboxCommands.replaceAll({ items: [ITEM_ONE], workspaceSummaries: [SUMMARY] });
    await sharedInboxCommands.replaceAll({ items: [], workspaceSummaries: [] });
    expect(await db.sharedInboxItems.count()).toBe(0);
    expect(await db.sharedInboxWorkspaceSummaries.count()).toBe(0);
  });

  it("assigns rank matching the source array index so ordering survives rehydrate", async () => {
    await sharedInboxCommands.replaceAll({
      items: [ITEM_TWO, ITEM_ONE],
      workspaceSummaries: [SUMMARY],
    });
    const rankedItems = await db.sharedInboxItems.orderBy("rank").toArray();
    expect(rankedItems.map((r) => r.pageId)).toEqual(["p2", "p1"]);
    expect(rankedItems.map((r) => r.rank)).toEqual([0, 1]);
  });
});
