import { beforeEach, describe, expect, it, vi } from "vitest";

import { memberships } from "@/worker/db/d1/schema";
import { checkMembership } from "@/worker/lib/membership";
import { createMembership } from "@tests/worker/util/fixtures";
import { mockAuthMiddleware, mockRateLimitMiddleware, createTestApp } from "@tests/worker/util/mocks";

vi.mock("@/worker/lib/membership", () => ({ checkMembership: vi.fn() }));
vi.mock("@/worker/middleware/auth", () => mockAuthMiddleware());
vi.mock("@/worker/middleware/rate-limit", () => mockRateLimitMiddleware());

const checkMembershipMock = vi.mocked(checkMembership);

interface MemberRow {
  user_id: string;
  workspace_id: string;
  role: "owner" | "admin" | "member" | "guest";
  joined_at: string;
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  user_created_at: string;
}

// Minimal mock that records the join + where shape so we can verify that guest
// callers receive a where clause scoped to their own user id.
function createMembersQueryDb(rows: MemberRow[]) {
  const whereSpy = vi.fn();
  const innerJoin = vi.fn().mockReturnValue({
    where: vi.fn().mockImplementation((predicate: unknown) => {
      whereSpy(predicate);
      return Promise.resolve(rows);
    }),
  });
  const select = vi.fn().mockReturnValue({
    from: vi.fn().mockImplementation((table: unknown) => {
      if (table === memberships) return { innerJoin };
      throw new Error(`Unexpected table in members query: ${String(table)}`);
    }),
  });
  return { db: { select }, whereSpy };
}

function makeRow(role: MemberRow["role"], userId: string): MemberRow {
  return {
    user_id: userId,
    workspace_id: "ws-1",
    role,
    joined_at: "2026-01-01T00:00:00.000Z",
    id: userId,
    email: `${userId}@example.com`,
    name: `Name ${userId}`,
    avatar_url: null,
    user_created_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("GET /workspaces/:id/members", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the full roster for owner/admin/member callers", async () => {
    checkMembershipMock.mockResolvedValue(createMembership("member", { user_id: "user-1", workspace_id: "ws-1" }));

    const { workspacesRouter } = await import("@/worker/routes/workspaces");
    const rows: MemberRow[] = [
      makeRow("owner", "owner-user"),
      makeRow("member", "user-1"),
      makeRow("guest", "guest-user"),
    ];
    const { db } = createMembersQueryDb(rows);
    const app = await createTestApp(workspacesRouter, "/api/v1", { db });

    const res = await app.request("/api/v1/workspaces/ws-1/members");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { members: Array<{ user_id: string; role: string }> };
    expect(body.members.map((m) => m.user_id).sort()).toEqual(["guest-user", "owner-user", "user-1"]);
  });

  it("returns a self-only projection for guest callers so they can still reach Leave Workspace", async () => {
    checkMembershipMock.mockResolvedValue(createMembership("guest", { user_id: "user-1", workspace_id: "ws-1" }));

    const { workspacesRouter } = await import("@/worker/routes/workspaces");
    // Simulate the guest-scoped query returning only the caller's row.
    const { db, whereSpy } = createMembersQueryDb([makeRow("guest", "user-1")]);
    const app = await createTestApp(workspacesRouter, "/api/v1", { db });

    const res = await app.request("/api/v1/workspaces/ws-1/members");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { members: Array<{ user_id: string; role: string }> };
    expect(body.members).toHaveLength(1);
    expect(body.members[0]).toMatchObject({ user_id: "user-1", role: "guest" });
    expect(whereSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects non-members with 403", async () => {
    checkMembershipMock.mockResolvedValue(null);

    const { workspacesRouter } = await import("@/worker/routes/workspaces");
    const { db } = createMembersQueryDb([]);
    const app = await createTestApp(workspacesRouter, "/api/v1", { db });

    const res = await app.request("/api/v1/workspaces/ws-1/members");

    expect(res.status).toBe(403);
  });
});
