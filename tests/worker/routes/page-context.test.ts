import { beforeEach, describe, expect, it, vi } from "vitest";

import { workspaces } from "@/worker/db/d1/schema";
import { getPage } from "@/worker/lib/page-access";
import { resolvePageAccessLevels, resolvePrincipal } from "@/worker/lib/permissions";
import { mockAuthMiddleware, mockRateLimitMiddleware, createTestApp } from "@tests/worker/util/mocks";

vi.mock("@/worker/lib/page-access", () => ({
  getPage: vi.fn(),
}));
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

const getPageMock = vi.mocked(getPage);
const resolvePrincipalMock = vi.mocked(resolvePrincipal);
const resolvePageAccessLevelsMock = vi.mocked(resolvePageAccessLevels);

function createDbMock(workspaceSlug: string | undefined) {
  const workspaceGet = vi.fn().mockResolvedValue(workspaceSlug ? { id: "ws-1", slug: workspaceSlug } : undefined);
  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: unknown) => {
      if (table === workspaces) {
        return { where: vi.fn().mockReturnValue({ get: workspaceGet }) };
      }
      throw new Error(`Unexpected table in test mock: ${String(table)}`);
    }),
  }));
  return { db: { select }, workspaceGet };
}

describe("page-context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPageMock.mockResolvedValue({
      id: "page-1",
      workspace_id: "ws-1",
      parent_id: null,
      kind: "doc",
      title: "Alpha",
      icon: null,
      cover_url: null,
      position: 0,
      created_by: "user-1",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      archived_at: null,
    });
  });

  it("returns canonical member viewer metadata for full workspace members", async () => {
    resolvePrincipalMock.mockResolvedValue({ principal: { type: "user", userId: "user-1" }, fullMember: true });

    const { pageContextRouter } = await import("@/worker/routes/page-context");
    const { db } = createDbMock("demo");
    const app = await createTestApp(pageContextRouter, "/api/v1", { db });

    const res = await app.request(new Request("http://test/api/v1/pages/page-1/context"));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      workspace: {
        id: "ws-1",
        slug: "demo",
      },
      viewer: {
        access_mode: "member",
        principal_type: "user",
        route_kind: "canonical",
        workspace_slug: "demo",
      },
    });
  });

  it("returns canonical shared viewer metadata for canonical share-derived access", async () => {
    resolvePrincipalMock.mockResolvedValue({ principal: { type: "user", userId: "user-1" }, fullMember: false });
    resolvePageAccessLevelsMock.mockResolvedValue(new Map([["page-1", "view"]]));

    const { pageContextRouter } = await import("@/worker/routes/page-context");
    const { db } = createDbMock("demo");
    const app = await createTestApp(pageContextRouter, "/api/v1", { db });

    const res = await app.request(new Request("http://test/api/v1/pages/page-1/context"));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      workspace: {
        id: "ws-1",
        slug: "demo",
      },
      viewer: {
        access_mode: "shared",
        principal_type: "user",
        route_kind: "canonical",
        workspace_slug: "demo",
      },
    });
    expect(resolvePageAccessLevelsMock).toHaveBeenCalledWith(
      expect.anything(),
      { type: "user", userId: "user-1" },
      ["page-1"],
      "ws-1",
    );
  });
});
