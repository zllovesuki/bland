import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  canAccessPage,
  canAccessPages,
  resolvePageAccessLevels,
  resolvePrincipal,
  toResolvedViewerContext,
} from "@/worker/lib/permissions";
import { checkMembership } from "@/worker/lib/membership";
import { createDbMock } from "@tests/worker/util/db";
import { createMembership } from "@tests/worker/util/fixtures";

vi.mock("@/worker/lib/membership", () => ({
  checkMembership: vi.fn(),
}));

const checkMembershipMock = vi.mocked(checkMembership);

describe("worker permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resolvePrincipal", () => {
    it("returns link principal on shared surface even when the user is a full member", async () => {
      const db = createDbMock();
      checkMembershipMock.mockResolvedValue(createMembership("member", { workspace_id: "workspace-1" }));

      const resolved = await resolvePrincipal(db, { id: "user-1" }, "workspace-1", {
        surface: "shared",
        shareToken: "share-token",
      });

      expect(resolved).toEqual({
        principal: { type: "link", token: "share-token" },
        memberBypass: false,
      });
      expect(checkMembershipMock).not.toHaveBeenCalled();
    });

    it("returns user principal with member fast-path on canonical surface for members", async () => {
      const db = createDbMock();
      checkMembershipMock.mockResolvedValue(createMembership("member", { workspace_id: "workspace-1" }));

      const resolved = await resolvePrincipal(db, { id: "user-1" }, "workspace-1", { surface: "canonical" });

      expect(resolved).toEqual({
        principal: { type: "user", userId: "user-1" },
        memberBypass: true,
      });
    });

    it("prefers share token for guests on canonical surface when provided", async () => {
      const db = createDbMock();
      checkMembershipMock.mockResolvedValue(createMembership("guest", { workspace_id: "workspace-1" }));

      const resolved = await resolvePrincipal(db, { id: "user-1" }, "workspace-1", {
        surface: "canonical",
        shareToken: "share-token",
      });

      expect(resolved).toEqual({
        principal: { type: "link", token: "share-token" },
        memberBypass: false,
      });
    });

    it("returns user principal for guest on canonical surface without share token", async () => {
      const db = createDbMock();
      checkMembershipMock.mockResolvedValue(createMembership("guest", { workspace_id: "workspace-1" }));

      const resolved = await resolvePrincipal(db, { id: "user-1" }, "workspace-1", { surface: "canonical" });

      expect(resolved).toEqual({
        principal: { type: "user", userId: "user-1" },
        memberBypass: false,
      });
    });

    it("returns anonymous link principal when no user is present", async () => {
      const db = createDbMock();

      const resolved = await resolvePrincipal(db, null, "workspace-1", {
        surface: "shared",
        shareToken: "share-token",
      });

      expect(resolved).toEqual({
        principal: { type: "link", token: "share-token" },
        memberBypass: false,
      });
    });

    it("returns null when no user and no share token", async () => {
      const db = createDbMock();

      const resolved = await resolvePrincipal(db, null, "workspace-1", { surface: "canonical" });

      expect(resolved).toBeNull();
    });
  });

  describe("toResolvedViewerContext", () => {
    it("marks shared surface as link-scoped regardless of member fast-path state", () => {
      const viewer = toResolvedViewerContext(
        { principal: { type: "link", token: "tok" }, memberBypass: false },
        "slug",
        "shared",
      );
      expect(viewer).toEqual({
        access_mode: "shared",
        principal_type: "link",
        route_kind: "shared",
        workspace_slug: null,
      });
    });

    it("serializes canonical viewer context with workspace slug", () => {
      const viewer = toResolvedViewerContext(
        { principal: { type: "user", userId: "u1" }, memberBypass: true },
        "slug",
        "canonical",
      );
      expect(viewer).toEqual({
        access_mode: "member",
        principal_type: "user",
        route_kind: "canonical",
        workspace_slug: "slug",
      });
    });
  });

  it("short-circuits workspace members to full access without running the share query", async () => {
    const db = createDbMock();

    checkMembershipMock.mockResolvedValue(createMembership("member", { workspace_id: "workspace-1" }));

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

    checkMembershipMock.mockResolvedValue(createMembership("guest", { workspace_id: "workspace-1" }));

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
