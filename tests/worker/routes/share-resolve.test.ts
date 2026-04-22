import { beforeEach, describe, expect, it, vi } from "vitest";

import { pageShares, workspaces } from "@/worker/db/d1/schema";
import { getPage } from "@/worker/lib/page-access";
import { resolvePrincipal } from "@/worker/lib/permissions";
import { createTestApp, mockRateLimitMiddleware } from "@tests/worker/util/mocks";

const { authState } = vi.hoisted(() => ({
  authState: {
    user: null as {
      id: string;
      email: string;
      password_hash: string;
      name: string;
      avatar_url: string | null;
      created_at: string;
      updated_at: string;
    } | null,
  },
}));

vi.mock("@/worker/lib/page-access", () => ({
  getPage: vi.fn(),
}));
vi.mock("@/worker/lib/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/worker/lib/permissions")>("@/worker/lib/permissions");
  return {
    ...actual,
    resolvePrincipal: vi.fn(),
  };
});
vi.mock("@/worker/middleware/auth", () => ({
  requireAuth: vi.fn(async (_c: object, next: () => Promise<void>) => next()),
  optionalAuth: vi.fn(
    async (c: { set: (key: "user" | "jwtPayload", value: unknown) => void }, next: () => Promise<void>) => {
      c.set("user", authState.user);
      c.set("jwtPayload", authState.user ? { sub: authState.user.id, jti: "jwt-1" } : null);
      await next();
    },
  ),
}));
vi.mock("@/worker/middleware/rate-limit", () => mockRateLimitMiddleware());

const getPageMock = vi.mocked(getPage);
const resolvePrincipalMock = vi.mocked(resolvePrincipal);

function createDbMock(opts: { shareRow?: object; workspaceSlug: string | undefined }) {
  const shareGet = vi.fn().mockResolvedValue(opts.shareRow);
  const workspaceGet = vi.fn().mockResolvedValue(opts.workspaceSlug ? { slug: opts.workspaceSlug } : undefined);
  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: unknown) => {
      if (table === pageShares) {
        return { where: vi.fn().mockReturnValue({ get: shareGet }) };
      }
      if (table === workspaces) {
        return { where: vi.fn().mockReturnValue({ get: workspaceGet }) };
      }
      throw new Error(`Unexpected table in test mock: ${String(table)}`);
    }),
  }));

  return { db: { select }, shareGet, workspaceGet };
}

describe("share resolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = null;
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

  it("returns shared viewer metadata for anonymous or link-based viewers", async () => {
    resolvePrincipalMock.mockResolvedValue({
      principal: { type: "link", token: "tok" },
      memberBypass: false,
    });

    const { shareLinkRouter } = await import("@/worker/routes/shares");
    const { db } = createDbMock({
      shareRow: { id: "share-1", page_id: "page-1", permission: "view", grantee_type: "link", link_token: "tok" },
      workspaceSlug: "demo",
    });
    const app = await createTestApp(shareLinkRouter, "/api/v1", { db });

    const res = await app.request(new Request("http://test/api/v1/share/tok"));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      permission: "view",
      token: "tok",
      viewer: {
        access_mode: "shared",
        principal_type: "link",
        route_kind: "shared",
        workspace_slug: null,
      },
    });
  });

  it("keeps shared viewer metadata link-scoped even when the caller is also a workspace member", async () => {
    authState.user = {
      id: "user-1",
      email: "user@example.com",
      password_hash: "hash",
      name: "Test User",
      avatar_url: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    // Surface-aware resolver always returns a link principal on the shared surface,
    // regardless of the caller's workspace membership. This is the invariant bug1/bug2 fix.
    resolvePrincipalMock.mockResolvedValue({
      principal: { type: "link", token: "tok" },
      memberBypass: false,
    });

    const { shareLinkRouter } = await import("@/worker/routes/shares");
    const { db } = createDbMock({
      shareRow: { id: "share-1", page_id: "page-1", permission: "view", grantee_type: "link", link_token: "tok" },
      workspaceSlug: "demo",
    });
    const app = await createTestApp(shareLinkRouter, "/api/v1", { db });

    const res = await app.request(new Request("http://test/api/v1/share/tok"));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      permission: "view",
      token: "tok",
      viewer: {
        access_mode: "shared",
        principal_type: "link",
        route_kind: "shared",
        workspace_slug: null,
      },
    });
  });
});
