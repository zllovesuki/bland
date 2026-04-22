import { beforeEach, describe, expect, it, vi } from "vitest";

import { memberships, pageShares } from "@/worker/db/d1/schema";
import { checkMembership } from "@/worker/lib/membership";
import { createMembership } from "@tests/worker/util/fixtures";
import { mockAuthMiddleware, mockRateLimitMiddleware, createTestApp } from "@tests/worker/util/mocks";

vi.mock("@/worker/lib/membership", () => ({ checkMembership: vi.fn() }));
vi.mock("@/worker/middleware/auth", () => mockAuthMiddleware());
vi.mock("@/worker/middleware/rate-limit", () => mockRateLimitMiddleware());

const checkMembershipMock = vi.mocked(checkMembership);

function createBatchCapturingDb() {
  const calls: Array<Array<{ table: unknown }>> = [];

  const delete_ = vi.fn().mockImplementation((table: unknown) => {
    const builder: { table: unknown; where: ReturnType<typeof vi.fn> } = {
      table,
      where: vi.fn(),
    };
    builder.where.mockReturnValue(builder);
    return builder;
  });

  const batch = vi.fn(async (ops: Array<{ table: unknown }>) => {
    calls.push(ops.map((op) => ({ table: op.table })));
    return ops.map(() => ({}));
  });

  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation(() => ({
      where: vi.fn().mockReturnValue([]),
    })),
  }));

  return {
    db: { delete: delete_, batch, select },
    calls,
    batch,
  };
}

describe("DELETE /workspaces/:id/members/:uid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("atomically deletes user-grantee page_shares and the membership row in one batch", async () => {
    // Admin removes member "user-2"
    checkMembershipMock
      .mockResolvedValueOnce(createMembership("admin", { user_id: "user-1", workspace_id: "ws-1" }))
      .mockResolvedValueOnce(createMembership("member", { user_id: "user-2", workspace_id: "ws-1" }));

    const { workspacesRouter } = await import("@/worker/routes/workspaces");
    const { db, calls } = createBatchCapturingDb();
    const app = await createTestApp(workspacesRouter, "/api/v1", { db });

    const res = await app.request("/api/v1/workspaces/ws-1/members/user-2", { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    const batchOps = calls[0];
    expect(batchOps).toHaveLength(2);
    // page_shares delete ordered before memberships delete
    expect(batchOps[0].table).toBe(pageShares);
    expect(batchOps[1].table).toBe(memberships);
  });

  it("refuses to remove the workspace owner", async () => {
    checkMembershipMock
      .mockResolvedValueOnce(createMembership("admin", { user_id: "user-1", workspace_id: "ws-1" }))
      .mockResolvedValueOnce(createMembership("owner", { user_id: "owner-user", workspace_id: "ws-1" }));

    const { workspacesRouter } = await import("@/worker/routes/workspaces");
    const { db, batch } = createBatchCapturingDb();
    const app = await createTestApp(workspacesRouter, "/api/v1", { db });

    const res = await app.request("/api/v1/workspaces/ws-1/members/owner-user", { method: "DELETE" });

    expect(res.status).toBe(403);
    expect(batch).not.toHaveBeenCalled();
  });

  it("refuses self-removal from the owner role", async () => {
    checkMembershipMock.mockResolvedValueOnce(createMembership("owner", { user_id: "user-1", workspace_id: "ws-1" }));

    const { workspacesRouter } = await import("@/worker/routes/workspaces");
    const { db, batch } = createBatchCapturingDb();
    const app = await createTestApp(workspacesRouter, "/api/v1", { db });

    const res = await app.request("/api/v1/workspaces/ws-1/members/user-1", { method: "DELETE" });

    expect(res.status).toBe(403);
    expect(batch).not.toHaveBeenCalled();
  });

  it("runs the batch on self-removal (guest leaves, their user-grantee shares are cleaned)", async () => {
    checkMembershipMock.mockResolvedValueOnce(createMembership("guest", { user_id: "user-1", workspace_id: "ws-1" }));

    const { workspacesRouter } = await import("@/worker/routes/workspaces");
    const { db, calls } = createBatchCapturingDb();
    const app = await createTestApp(workspacesRouter, "/api/v1", { db });

    const res = await app.request("/api/v1/workspaces/ws-1/members/user-1", { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0][0].table).toBe(pageShares);
    expect(calls[0][1].table).toBe(memberships);
  });

  it("rejects non-admin callers trying to remove someone else", async () => {
    checkMembershipMock.mockResolvedValueOnce(createMembership("member", { user_id: "user-1", workspace_id: "ws-1" }));

    const { workspacesRouter } = await import("@/worker/routes/workspaces");
    const { db, batch } = createBatchCapturingDb();
    const app = await createTestApp(workspacesRouter, "/api/v1", { db });

    const res = await app.request("/api/v1/workspaces/ws-1/members/user-2", { method: "DELETE" });

    expect(res.status).toBe(403);
    expect(batch).not.toHaveBeenCalled();
  });
});
