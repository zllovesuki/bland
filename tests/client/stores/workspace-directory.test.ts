import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFreshDb, deleteDb } from "@tests/client/util/idb";
import { createMembershipSummary, createWorkspace } from "@tests/client/util/fixtures";
import type { BlandDatabase, MemberWorkspaceRow } from "@/client/stores/db/bland-db";

let db: BlandDatabase;
let directoryCommands: typeof import("@/client/stores/db/workspace-directory").directoryCommands;

async function readInRankOrder(): Promise<MemberWorkspaceRow[]> {
  return db.memberWorkspaces.orderBy("rank").toArray();
}

beforeEach(async () => {
  vi.resetModules();
  db = createFreshDb();
  vi.doMock("@/client/stores/db/bland-db", async () => {
    const actual = await vi.importActual<typeof import("@/client/stores/db/bland-db")>("@/client/stores/db/bland-db");
    return { ...actual, db };
  });
  directoryCommands = (await import("@/client/stores/db/workspace-directory")).directoryCommands;
});

afterEach(async () => {
  await deleteDb(db);
  vi.restoreAllMocks();
});

describe("directoryCommands", () => {
  it("replaceAll replaces every directory row in one transaction", async () => {
    await directoryCommands.replaceAll([createMembershipSummary({ id: "ws-1" })]);
    await directoryCommands.replaceAll([
      createMembershipSummary({ id: "ws-2", slug: "second" }),
      createMembershipSummary({ id: "ws-3", slug: "third" }),
    ]);
    const rows = (await db.memberWorkspaces.toArray()).map((r) => r.id).sort();
    expect(rows).toEqual(["ws-2", "ws-3"]);
  });

  it("upsert adds a new row and updates an existing row", async () => {
    await directoryCommands.upsert(createMembershipSummary({ id: "ws-1", name: "First" }));
    expect((await db.memberWorkspaces.get("ws-1"))?.name).toBe("First");

    await directoryCommands.upsert(createMembershipSummary({ id: "ws-1", name: "Renamed" }));
    expect((await db.memberWorkspaces.get("ws-1"))?.name).toBe("Renamed");
  });

  it("patch merges plain Workspace updates without dropping role", async () => {
    await directoryCommands.upsert(createMembershipSummary({ id: "ws-1", name: "Old", role: "guest" }));
    await directoryCommands.patch("ws-1", createWorkspace({ id: "ws-1", name: "Renamed" }));
    const row = await db.memberWorkspaces.get("ws-1");
    expect(row?.name).toBe("Renamed");
    expect(row?.role).toBe("guest");
  });

  it("patch no-ops when the row is absent", async () => {
    await directoryCommands.patch("ws-missing", createWorkspace({ id: "ws-missing", name: "Ghost" }));
    expect(await db.memberWorkspaces.get("ws-missing")).toBeUndefined();
  });

  it("remove deletes by id", async () => {
    await directoryCommands.replaceAll([
      createMembershipSummary({ id: "ws-1" }),
      createMembershipSummary({ id: "ws-2" }),
    ]);
    await directoryCommands.remove("ws-1");
    const ids = (await db.memberWorkspaces.toArray()).map((r) => r.id);
    expect(ids).toEqual(["ws-2"]);
  });

  describe("durable ordering", () => {
    it("replaceAll assigns a rank matching the source array index", async () => {
      await directoryCommands.replaceAll([
        createMembershipSummary({ id: "ws-c", slug: "c" }),
        createMembershipSummary({ id: "ws-a", slug: "a" }),
        createMembershipSummary({ id: "ws-b", slug: "b" }),
      ]);
      const rows = await readInRankOrder();
      expect(rows.map((r) => r.id)).toEqual(["ws-c", "ws-a", "ws-b"]);
    });

    it("upsert preserves an existing row's rank", async () => {
      await directoryCommands.replaceAll([
        createMembershipSummary({ id: "ws-1", slug: "one" }),
        createMembershipSummary({ id: "ws-2", slug: "two" }),
      ]);
      await directoryCommands.upsert(createMembershipSummary({ id: "ws-1", slug: "one-renamed" }));
      const rows = await readInRankOrder();
      expect(rows.map((r) => r.id)).toEqual(["ws-1", "ws-2"]);
      expect(rows.find((r) => r.id === "ws-1")?.slug).toBe("one-renamed");
    });

    it("upsert appends a new workspace at max(rank) + 1", async () => {
      await directoryCommands.replaceAll([
        createMembershipSummary({ id: "ws-1" }),
        createMembershipSummary({ id: "ws-2" }),
      ]);
      await directoryCommands.upsert(createMembershipSummary({ id: "ws-3" }));
      const rows = await readInRankOrder();
      expect(rows.map((r) => r.id)).toEqual(["ws-1", "ws-2", "ws-3"]);
    });

    it("patch preserves rank alongside role", async () => {
      await directoryCommands.replaceAll([
        createMembershipSummary({ id: "ws-1", role: "guest" }),
        createMembershipSummary({ id: "ws-2" }),
      ]);
      await directoryCommands.patch("ws-1", createWorkspace({ id: "ws-1", name: "Renamed" }));
      const rows = await readInRankOrder();
      expect(rows[0]).toMatchObject({ id: "ws-1", name: "Renamed", role: "guest", rank: 0 });
    });
  });
});
