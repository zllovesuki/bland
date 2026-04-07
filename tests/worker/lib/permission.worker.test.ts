import { beforeEach, describe, expect, it, vi } from "vitest";

import { canAccessPage, canAccessPages, resolvePageAccessLevels } from "@/worker/lib/permissions";
import { checkMembership } from "@/worker/lib/membership";
import { createDbMock } from "@tests/worker/util/db";

vi.mock("@/worker/lib/membership", () => ({
  checkMembership: vi.fn(),
}));

const checkMembershipMock = vi.mocked(checkMembership);

describe("worker permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("short-circuits workspace members to full access without running the share query", async () => {
    const db = createDbMock();

    checkMembershipMock.mockResolvedValue({
      user_id: "user-1",
      workspace_id: "workspace-1",
      role: "member",
      joined_at: "2026-04-06T00:00:00.000Z",
    });

    const levels = await resolvePageAccessLevels(
      db,
      { type: "user", userId: "user-1" },
      ["page-a", "page-b"],
      "workspace-1",
    );

    expect(levels).toEqual(
      new Map([
        ["page-a", "edit"],
        ["page-b", "edit"],
      ]),
    );
    expect(db.all).not.toHaveBeenCalled();
  });

  it("maps batch query ranks to access levels and fills missing pages with none", async () => {
    const db = createDbMock([
      { page_id: "page-a", access_rank: 2 },
      { page_id: "page-b", access_rank: 1 },
    ]);

    checkMembershipMock.mockResolvedValue({
      user_id: "user-1",
      workspace_id: "workspace-1",
      role: "guest",
      joined_at: "2026-04-06T00:00:00.000Z",
    });

    const levels = await resolvePageAccessLevels(
      db,
      { type: "user", userId: "user-1" },
      ["page-a", "page-b", "page-c"],
      "workspace-1",
    );

    expect(levels).toEqual(
      new Map([
        ["page-a", "edit"],
        ["page-b", "view"],
        ["page-c", "none"],
      ]),
    );
    expect(db.all).toHaveBeenCalledTimes(1);
  });

  it("converts resolved levels into booleans for batch view and edit checks", async () => {
    const rows = [
      { page_id: "page-a", access_rank: 2 },
      { page_id: "page-b", access_rank: 1 },
      { page_id: "page-c", access_rank: 0 },
    ];
    const db = createDbMock(rows, rows);

    checkMembershipMock.mockResolvedValue(null);

    const viewResults = await canAccessPages(
      db,
      { type: "user", userId: "user-1" },
      ["page-a", "page-b", "page-c"],
      "workspace-1",
      "view",
    );
    const editResults = await canAccessPages(
      db,
      { type: "user", userId: "user-1" },
      ["page-a", "page-b", "page-c"],
      "workspace-1",
      "edit",
    );

    expect(viewResults).toEqual(
      new Map([
        ["page-a", true],
        ["page-b", true],
        ["page-c", false],
      ]),
    );
    expect(editResults).toEqual(
      new Map([
        ["page-a", true],
        ["page-b", false],
        ["page-c", false],
      ]),
    );
  });

  it("uses the same resolver path for single-page checks", async () => {
    const rows = [{ page_id: "page-a", access_rank: 1 }];
    const db = createDbMock(rows, rows);

    checkMembershipMock.mockResolvedValue(null);

    await expect(canAccessPage(db, { type: "user", userId: "user-1" }, "page-a", "workspace-1", "view")).resolves.toBe(
      true,
    );
    await expect(canAccessPage(db, { type: "user", userId: "user-1" }, "page-a", "workspace-1", "edit")).resolves.toBe(
      false,
    );
  });

  it("skips membership checks for link principals and resolves access from shares only", async () => {
    const db = createDbMock([{ page_id: "page-a", access_rank: 2 }]);

    const levels = await resolvePageAccessLevels(db, { type: "link", token: "share-token" }, ["page-a"], "workspace-1");

    expect(levels).toEqual(new Map([["page-a", "edit"]]));
    expect(checkMembershipMock).not.toHaveBeenCalled();
    expect(db.all).toHaveBeenCalledTimes(1);
  });
});
