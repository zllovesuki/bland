import { beforeEach, describe, expect, it, vi } from "vitest";

import { memberships } from "@/worker/db/d1/schema";
import { checkMembership } from "@/worker/lib/membership";
import { createMembership } from "@tests/worker/util/fixtures";
import { mockAuthMiddleware, mockRateLimitMiddleware, createTestApp } from "@tests/worker/util/mocks";

vi.mock("@/worker/lib/membership", () => ({ checkMembership: vi.fn() }));
vi.mock("@/worker/middleware/auth", () => mockAuthMiddleware());
vi.mock("@/worker/middleware/rate-limit", () => mockRateLimitMiddleware());

const checkMembershipMock = vi.mocked(checkMembership);

function createUpdateCapturingDb() {
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  const update = vi.fn().mockImplementation((table: unknown) => {
    if (table !== memberships) throw new Error(`Unexpected update table: ${String(table)}`);
    return { set: updateSet };
  });
  return { db: { update }, updateSet };
}

async function patchRole(targetUserId: string, role: string) {
  return new Request(`http://test/api/v1/workspaces/ws-1/members/${targetUserId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role }),
  });
}

describe("PATCH /workspaces/:id/members/:uid — role management", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets the owner promote a member to admin", async () => {
    checkMembershipMock
      .mockResolvedValueOnce(createMembership("owner", { user_id: "user-1", workspace_id: "ws-1" }))
      .mockResolvedValueOnce(createMembership("member", { user_id: "user-2", workspace_id: "ws-1" }));

    const { workspacesRouter } = await import("@/worker/routes/workspaces");
    const { db, updateSet } = createUpdateCapturingDb();
    const app = await createTestApp(workspacesRouter, "/api/v1", { db });

    const res = await app.request(await patchRole("user-2", "admin"));

    expect(res.status).toBe(200);
    expect(updateSet).toHaveBeenCalledWith({ role: "admin" });
  });

  it("blocks an admin from promoting another member to admin", async () => {
    checkMembershipMock
      .mockResolvedValueOnce(createMembership("admin", { user_id: "user-1", workspace_id: "ws-1" }))
      .mockResolvedValueOnce(createMembership("member", { user_id: "user-2", workspace_id: "ws-1" }));

    const { workspacesRouter } = await import("@/worker/routes/workspaces");
    const { db } = createUpdateCapturingDb();
    const app = await createTestApp(workspacesRouter, "/api/v1", { db });

    const res = await app.request(await patchRole("user-2", "admin"));

    expect(res.status).toBe(403);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/Only the owner/);
  });

  it("lets an admin demote a member to guest", async () => {
    checkMembershipMock
      .mockResolvedValueOnce(createMembership("admin", { user_id: "user-1", workspace_id: "ws-1" }))
      .mockResolvedValueOnce(createMembership("member", { user_id: "user-2", workspace_id: "ws-1" }));

    const { workspacesRouter } = await import("@/worker/routes/workspaces");
    const { db, updateSet } = createUpdateCapturingDb();
    const app = await createTestApp(workspacesRouter, "/api/v1", { db });

    const res = await app.request(await patchRole("user-2", "guest"));

    expect(res.status).toBe(200);
    expect(updateSet).toHaveBeenCalledWith({ role: "guest" });
  });

  it("refuses to change the owner's role", async () => {
    checkMembershipMock
      .mockResolvedValueOnce(createMembership("admin", { user_id: "user-1", workspace_id: "ws-1" }))
      .mockResolvedValueOnce(createMembership("owner", { user_id: "owner-user", workspace_id: "ws-1" }));

    const { workspacesRouter } = await import("@/worker/routes/workspaces");
    const { db } = createUpdateCapturingDb();
    const app = await createTestApp(workspacesRouter, "/api/v1", { db });

    const res = await app.request(await patchRole("owner-user", "member"));

    expect(res.status).toBe(403);
  });

  it("rejects members and guests from changing roles", async () => {
    checkMembershipMock.mockResolvedValueOnce(createMembership("member", { user_id: "user-1", workspace_id: "ws-1" }));

    const { workspacesRouter } = await import("@/worker/routes/workspaces");
    const { db } = createUpdateCapturingDb();
    const app = await createTestApp(workspacesRouter, "/api/v1", { db });

    const res = await app.request(await patchRole("user-2", "guest"));

    expect(res.status).toBe(403);
  });
});
