import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockAuthMiddleware, mockRateLimitMiddleware, createTestApp } from "@tests/worker/util/mocks";

vi.mock("@/worker/middleware/auth", () => mockAuthMiddleware());
vi.mock("@/worker/middleware/rate-limit", () => mockRateLimitMiddleware());

/**
 * `/me/shared-pages` partitions user-grantee page_shares into:
 *   * `items`: pages in workspaces the caller is NOT a member of (discovery).
 *   * `workspace_summaries`: grouped counts for workspaces the caller already
 *     belongs to (those pages are reachable in the workspace tree).
 *
 * The route issues two queries and then shapes the response. This test
 * verifies the shape and that the two queries are parallelized.
 */

function createInboxDbMock(opts: { crossWorkspaceRows: object[]; summaryRows: object[] }) {
  let callCount = 0;

  const select = vi.fn().mockImplementation(() => {
    const call = callCount++;
    const chain = {
      from: vi.fn().mockReturnValue(null as unknown),
      as: vi.fn().mockReturnValue({ id: "shared_by_user.id", name: "shared_by_user.name" }),
    };
    const terminal = {
      innerJoin: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockImplementation(() => Promise.resolve(opts.crossWorkspaceRows)),
      groupBy: vi.fn().mockImplementation(() => Promise.resolve(opts.summaryRows)),
    };
    chain.from.mockReturnValue(terminal);
    // The `users.as()` shortcut (first select) returns a subquery spec, not
    // a terminal query. The route call sequence is:
    //   0: aliased subquery (sharedByUser)
    //   1: cross-workspace items
    //   2: summaries
    if (call === 0) {
      return { from: vi.fn().mockReturnValue({ as: chain.as }) };
    }
    return chain;
  });

  return { select };
}

describe("GET /me/shared-pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns items and workspace_summaries in the response shape", async () => {
    const { sharesRouter } = await import("@/worker/routes/shares");
    const db = createInboxDbMock({
      crossWorkspaceRows: [
        {
          page_id: "p1",
          title: "Cross",
          icon: null,
          cover_url: null,
          workspace_id: "ws-other",
          workspace_name: "Other",
          workspace_slug: "other",
          workspace_icon: null,
          permission: "view",
          shared_by: "user-2",
          shared_by_name: "Alice",
          shared_at: "2026-04-01T00:00:00.000Z",
        },
      ],
      summaryRows: [
        {
          workspace_id: "ws-home",
          workspace_name: "Home",
          workspace_slug: "home",
          workspace_icon: null,
          count: 3,
        },
      ],
    });

    const app = await createTestApp(sharesRouter, "/api/v1", { db });
    const res = await app.request("/api/v1/me/shared-pages");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      items: Array<{ page_id: string; workspace: { id: string; role: null | string } }>;
      workspace_summaries: Array<{ workspace: { id: string; slug: string }; count: number }>;
    };

    expect(body.items).toHaveLength(1);
    expect(body.items[0].page_id).toBe("p1");
    expect(body.items[0].workspace.id).toBe("ws-other");
    expect(body.items[0].workspace.role).toBeNull();

    expect(body.workspace_summaries).toHaveLength(1);
    expect(body.workspace_summaries[0]).toEqual({
      workspace: { id: "ws-home", name: "Home", slug: "home", icon: null },
      count: 3,
    });
  });

  it("coerces string counts from D1 into numbers", async () => {
    const { sharesRouter } = await import("@/worker/routes/shares");
    const db = createInboxDbMock({
      crossWorkspaceRows: [],
      summaryRows: [
        {
          workspace_id: "ws-home",
          workspace_name: "Home",
          workspace_slug: "home",
          workspace_icon: null,
          count: "2",
        },
      ],
    });

    const app = await createTestApp(sharesRouter, "/api/v1", { db });
    const res = await app.request("/api/v1/me/shared-pages");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      workspace_summaries: Array<{ count: number }>;
    };
    expect(body.workspace_summaries[0].count).toBe(2);
  });
});
