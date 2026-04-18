import { describe, expect, it, vi, beforeEach } from "vitest";

import { workspaces, pages } from "@/worker/db/d1/schema";
import { ResolvePageMentionsResponse } from "@/shared/types";
import { resolvePrincipal, resolvePageAccessLevels } from "@/worker/lib/permissions";
import { mockAuthMiddleware, mockRateLimitMiddleware, createTestApp } from "@tests/worker/util/mocks";
import { ApiErrorResponse } from "@tests/worker/util/schemas";

vi.mock("@/worker/lib/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/worker/lib/permissions")>("@/worker/lib/permissions");
  return {
    ...actual,
    resolvePrincipal: vi.fn(),
    resolvePageAccessLevels: vi.fn(),
  };
});
vi.mock("@/worker/middleware/auth", () => mockAuthMiddleware());
vi.mock("@/worker/middleware/rate-limit", () => mockRateLimitMiddleware());

const resolvePrincipalMock = vi.mocked(resolvePrincipal);
const resolvePageAccessLevelsMock = vi.mocked(resolvePageAccessLevels);

function createDbMock(opts: {
  workspaceSlug: string | undefined;
  pageRows: Array<{ id: string; title: string; icon: string | null }>;
}) {
  const workspaceGet = vi
    .fn()
    .mockResolvedValue(opts.workspaceSlug ? { id: "ws-1", slug: opts.workspaceSlug } : undefined);
  const pagesWhere = vi.fn().mockResolvedValue(opts.pageRows);

  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: unknown) => {
      if (table === workspaces) {
        return { where: vi.fn().mockReturnValue({ get: workspaceGet }) };
      }
      if (table === pages) {
        return { where: pagesWhere };
      }
      throw new Error(`Unexpected table in test mock: ${String(table)}`);
    }),
  }));

  return { db: { select }, workspaceGet, pagesWhere };
}

async function postResolve(body: unknown, query = "") {
  return new Request(`http://test/api/v1/workspaces/ws-1/page-mentions/resolve${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("page-mentions: resolve", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves accessible pages for a full member", async () => {
    resolvePrincipalMock.mockResolvedValue({ principal: { type: "user", userId: "user-1" }, fullMember: true });
    resolvePageAccessLevelsMock.mockResolvedValue(
      new Map([
        ["p-1", "edit"],
        ["p-2", "edit"],
      ]),
    );

    const { pageMentionsRouter } = await import("@/worker/routes/page-mentions");
    const { db } = createDbMock({
      workspaceSlug: "demo",
      pageRows: [
        { id: "p-1", title: "Alpha", icon: "A" },
        { id: "p-2", title: "Beta", icon: null },
      ],
    });
    const app = await createTestApp(pageMentionsRouter, "/api/v1", { db });

    const res = await app.request(await postResolve({ page_ids: ["p-1", "p-2"] }));
    expect(res.status).toBe(200);
    const body = ResolvePageMentionsResponse.parse(await res.json());
    expect(body.mentions).toEqual([
      { page_id: "p-1", accessible: true, title: "Alpha", icon: "A" },
      { page_id: "p-2", accessible: true, title: "Beta", icon: null },
    ]);
  });

  it("resolves shared-link mentions when the principal is a link token", async () => {
    resolvePrincipalMock.mockResolvedValue({ principal: { type: "link", token: "tok" }, fullMember: false });
    resolvePageAccessLevelsMock.mockResolvedValue(new Map([["p-1", "view"]]));

    const { pageMentionsRouter } = await import("@/worker/routes/page-mentions");
    const { db } = createDbMock({
      workspaceSlug: "demo",
      pageRows: [{ id: "p-1", title: "Alpha", icon: null }],
    });
    const app = await createTestApp(pageMentionsRouter, "/api/v1", { db });

    const res = await app.request(await postResolve({ page_ids: ["p-1"] }, "?share=tok"));
    expect(res.status).toBe(200);
    const body = ResolvePageMentionsResponse.parse(await res.json());
    expect(body.mentions[0].accessible).toBe(true);
  });

  it("keeps member precedence when a full member request also carries ?share=", async () => {
    resolvePrincipalMock.mockResolvedValue({ principal: { type: "user", userId: "user-1" }, fullMember: true });
    resolvePageAccessLevelsMock.mockResolvedValue(new Map([["p-1", "edit"]]));

    const { pageMentionsRouter } = await import("@/worker/routes/page-mentions");
    const { db } = createDbMock({
      workspaceSlug: "demo",
      pageRows: [{ id: "p-1", title: "Alpha", icon: null }],
    });
    const app = await createTestApp(pageMentionsRouter, "/api/v1", { db });

    const res = await app.request(await postResolve({ page_ids: ["p-1"] }, "?share=tok"));
    expect(res.status).toBe(200);
    const body = ResolvePageMentionsResponse.parse(await res.json());
    expect(body.mentions[0].accessible).toBe(true);
  });

  it("resolves canonical shared access without a share token", async () => {
    resolvePrincipalMock.mockResolvedValue({ principal: { type: "user", userId: "user-1" }, fullMember: false });
    resolvePageAccessLevelsMock.mockResolvedValue(new Map([["p-1", "view"]]));

    const { pageMentionsRouter } = await import("@/worker/routes/page-mentions");
    const { db } = createDbMock({
      workspaceSlug: "demo",
      pageRows: [{ id: "p-1", title: "Alpha", icon: null }],
    });
    const app = await createTestApp(pageMentionsRouter, "/api/v1", { db });

    const res = await app.request(await postResolve({ page_ids: ["p-1"] }));
    expect(res.status).toBe(200);
    const body = ResolvePageMentionsResponse.parse(await res.json());
    expect(body.mentions[0].accessible).toBe(true);
  });

  it("collapses inaccessible ids to restricted without leaking title or icon", async () => {
    resolvePrincipalMock.mockResolvedValue({ principal: { type: "link", token: "tok" }, fullMember: false });
    resolvePageAccessLevelsMock.mockResolvedValue(
      new Map([
        ["p-1", "view"],
        ["p-blocked", "none"],
      ]),
    );

    const { pageMentionsRouter } = await import("@/worker/routes/page-mentions");
    const { db, pagesWhere } = createDbMock({
      workspaceSlug: "demo",
      pageRows: [{ id: "p-1", title: "Alpha", icon: "A" }],
    });
    const app = await createTestApp(pageMentionsRouter, "/api/v1", { db });

    const res = await app.request(await postResolve({ page_ids: ["p-1", "p-blocked"] }, "?share=tok"));
    expect(res.status).toBe(200);
    const body = ResolvePageMentionsResponse.parse(await res.json());
    expect(body.mentions).toEqual([
      { page_id: "p-1", accessible: true, title: "Alpha", icon: "A" },
      { page_id: "p-blocked", accessible: false, title: null, icon: null },
    ]);
    expect(pagesWhere).toHaveBeenCalledTimes(1);
  });

  it("collapses shared non-member misses to restricted mention entries", async () => {
    resolvePrincipalMock.mockResolvedValue({ principal: { type: "link", token: "tok" }, fullMember: false });
    resolvePageAccessLevelsMock.mockResolvedValue(new Map([["p-blocked", "none"]]));

    const { pageMentionsRouter } = await import("@/worker/routes/page-mentions");
    const { db } = createDbMock({
      workspaceSlug: "demo",
      pageRows: [],
    });
    const app = await createTestApp(pageMentionsRouter, "/api/v1", { db });

    const res = await app.request(await postResolve({ page_ids: ["p-blocked"] }, "?share=tok"));
    expect(res.status).toBe(200);
    const body = ResolvePageMentionsResponse.parse(await res.json());
    expect(body.mentions).toEqual([{ page_id: "p-blocked", accessible: false, title: null, icon: null }]);
  });

  it("collapses archived-or-missing accessible pages to restricted mention entries", async () => {
    resolvePrincipalMock.mockResolvedValue({ principal: { type: "user", userId: "user-1" }, fullMember: true });
    resolvePageAccessLevelsMock.mockResolvedValue(new Map([["p-archived", "edit"]]));

    const { pageMentionsRouter } = await import("@/worker/routes/page-mentions");
    const { db } = createDbMock({ workspaceSlug: "demo", pageRows: [] });
    const app = await createTestApp(pageMentionsRouter, "/api/v1", { db });

    const res = await app.request(await postResolve({ page_ids: ["p-archived"] }));
    expect(res.status).toBe(200);
    const body = ResolvePageMentionsResponse.parse(await res.json());
    expect(body.mentions).toEqual([{ page_id: "p-archived", accessible: false, title: null, icon: null }]);
  });

  it("returns 404 when the workspace does not exist", async () => {
    resolvePrincipalMock.mockResolvedValue({ principal: { type: "user", userId: "user-1" }, fullMember: true });

    const { pageMentionsRouter } = await import("@/worker/routes/page-mentions");
    const { db } = createDbMock({ workspaceSlug: undefined, pageRows: [] });
    const app = await createTestApp(pageMentionsRouter, "/api/v1", { db });

    const res = await app.request(await postResolve({ page_ids: ["p-1"] }));
    expect(res.status).toBe(404);
    expect(ApiErrorResponse.parse(await res.json()).error).toBe("not_found");
  });

  it("returns 401 when no principal can be resolved", async () => {
    resolvePrincipalMock.mockResolvedValue(null);

    const { pageMentionsRouter } = await import("@/worker/routes/page-mentions");
    const { db } = createDbMock({ workspaceSlug: "demo", pageRows: [] });
    const app = await createTestApp(pageMentionsRouter, "/api/v1", { db });

    const res = await app.request(await postResolve({ page_ids: ["p-1"] }));
    expect(res.status).toBe(401);
  });

  it("rejects batches larger than the cap", async () => {
    const { pageMentionsRouter } = await import("@/worker/routes/page-mentions");
    const { db } = createDbMock({ workspaceSlug: "demo", pageRows: [] });
    const app = await createTestApp(pageMentionsRouter, "/api/v1", { db });

    const ids = Array.from({ length: 101 }, (_, i) => `p-${i}`);
    const res = await app.request(await postResolve({ page_ids: ids }));
    expect(res.status).toBe(400);
    expect(resolvePrincipalMock).not.toHaveBeenCalled();
  });

  it("dedupes duplicate ids before resolving access", async () => {
    resolvePrincipalMock.mockResolvedValue({ principal: { type: "user", userId: "user-1" }, fullMember: true });
    resolvePageAccessLevelsMock.mockResolvedValue(new Map([["p-1", "edit"]]));

    const { pageMentionsRouter } = await import("@/worker/routes/page-mentions");
    const { db } = createDbMock({
      workspaceSlug: "demo",
      pageRows: [{ id: "p-1", title: "Alpha", icon: null }],
    });
    const app = await createTestApp(pageMentionsRouter, "/api/v1", { db });

    const res = await app.request(await postResolve({ page_ids: ["p-1", "p-1", "p-1"] }));
    expect(res.status).toBe(200);
    const body = ResolvePageMentionsResponse.parse(await res.json());
    expect(body.mentions).toHaveLength(1);
    expect(resolvePageAccessLevelsMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), ["p-1"], "ws-1");
  });

  it("collapses malformed ids to restricted instead of rejecting the whole batch", async () => {
    resolvePrincipalMock.mockResolvedValue({ principal: { type: "user", userId: "user-1" }, fullMember: true });
    resolvePageAccessLevelsMock.mockResolvedValue(
      new Map([
        ["p-1", "edit"],
        ["not-a-real-id-that-is-way-too-long-for-a-page", "none"],
      ]),
    );

    const { pageMentionsRouter } = await import("@/worker/routes/page-mentions");
    const { db } = createDbMock({
      workspaceSlug: "demo",
      pageRows: [{ id: "p-1", title: "Alpha", icon: null }],
    });
    const app = await createTestApp(pageMentionsRouter, "/api/v1", { db });

    const malformedId = "not-a-real-id-that-is-way-too-long-for-a-page";
    const res = await app.request(await postResolve({ page_ids: ["p-1", malformedId] }));
    expect(res.status).toBe(200);
    const body = ResolvePageMentionsResponse.parse(await res.json());
    expect(body.mentions).toEqual([
      { page_id: "p-1", accessible: true, title: "Alpha", icon: null },
      { page_id: malformedId, accessible: false, title: null, icon: null },
    ]);
  });
});
