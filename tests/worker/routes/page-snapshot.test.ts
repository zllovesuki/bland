import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPage } from "@/worker/lib/page-access";
import { resolvePageAccessLevels, resolvePrincipal } from "@/worker/lib/permissions";
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
    resolvePageAccessLevels: vi.fn(),
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
const resolvePageAccessLevelsMock = vi.mocked(resolvePageAccessLevels);

function createEnvMock(snapshotResult: { kind: "found"; response: Response } | { kind: "missing" }) {
  const getSnapshotResponse = vi.fn().mockResolvedValue(snapshotResult);
  const getByName = vi.fn().mockReturnValue({ getSnapshotResponse });
  return {
    env: {
      DocSync: { getByName },
    },
    getByName,
    getSnapshotResponse,
  };
}

describe("page snapshot route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = {
      id: "user-1",
      email: "user@example.com",
      password_hash: "hash",
      name: "Test User",
      avatar_url: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    getPageMock.mockResolvedValue({
      id: "page-1",
      workspace_id: "ws-1",
      parent_id: null,
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

  it("streams the persisted snapshot for full workspace members", async () => {
    resolvePrincipalMock.mockResolvedValue({ principal: { type: "user", userId: "user-1" }, fullMember: true });

    const expectedBytes = Uint8Array.from([1, 2, 3, 4]);
    const { pagesRouter } = await import("@/worker/routes/pages");
    const env = createEnvMock({
      kind: "found",
      response: new Response(expectedBytes, { headers: { "Content-Type": "application/octet-stream" } }),
    });
    const app = await createTestApp(pagesRouter, "/api/v1", { db: {}, env: env.env });

    const res = await app.request(new Request("http://test/api/v1/workspaces/ws-1/pages/page-1/snapshot"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(expectedBytes);
    expect(env.getByName).toHaveBeenCalledWith("page-1");
    expect(env.getSnapshotResponse).toHaveBeenCalledWith("page-1");
  });

  it("returns 204 when no persisted snapshot exists yet", async () => {
    resolvePrincipalMock.mockResolvedValue({ principal: { type: "user", userId: "user-1" }, fullMember: true });

    const { pagesRouter } = await import("@/worker/routes/pages");
    const env = createEnvMock({ kind: "missing" });
    const app = await createTestApp(pagesRouter, "/api/v1", { db: {}, env: env.env });

    const res = await app.request(new Request("http://test/api/v1/workspaces/ws-1/pages/page-1/snapshot"));

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("allows shared callers with page access to read the snapshot", async () => {
    authState.user = null;
    resolvePrincipalMock.mockResolvedValue({ principal: { type: "link", token: "share-token" }, fullMember: false });
    resolvePageAccessLevelsMock.mockResolvedValue(new Map([["page-1", "view"]]));

    const expectedBytes = Uint8Array.from([9, 8, 7]);
    const { pagesRouter } = await import("@/worker/routes/pages");
    const env = createEnvMock({
      kind: "found",
      response: new Response(expectedBytes, { headers: { "Content-Type": "application/octet-stream" } }),
    });
    const app = await createTestApp(pagesRouter, "/api/v1", { db: {}, env: env.env });

    const res = await app.request(
      new Request("http://test/api/v1/workspaces/ws-1/pages/page-1/snapshot?share=share-token"),
    );

    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(expectedBytes);
    expect(resolvePageAccessLevelsMock).toHaveBeenCalledWith(
      expect.anything(),
      { type: "link", token: "share-token" },
      ["page-1"],
      "ws-1",
    );
  });
});
