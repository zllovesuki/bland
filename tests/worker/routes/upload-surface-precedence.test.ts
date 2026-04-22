import { beforeEach, describe, expect, it, vi } from "vitest";

import { pageShares, pages, uploads } from "@/worker/db/d1/schema";
import { getPage } from "@/worker/lib/page-access";
import { checkMembership } from "@/worker/lib/membership";
import { canAccessPage } from "@/worker/lib/permissions";
import { mockJose, mockAuthHelpers, mockRateLimitMiddleware, createTestApp } from "@tests/worker/util/mocks";
import { createMembership, TEST_TIMESTAMP } from "@tests/worker/util/fixtures";

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

vi.mock("@/worker/lib/page-access", () => ({ getPage: vi.fn() }));
vi.mock("@/worker/lib/membership", () => ({ checkMembership: vi.fn() }));
vi.mock("@/worker/lib/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/worker/lib/permissions")>("@/worker/lib/permissions");
  return { ...actual, canAccessPage: vi.fn() };
});
vi.mock("jose", () => mockJose());
vi.mock("@/worker/lib/auth", () => mockAuthHelpers());
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

const MEMBER_USER = {
  id: "user-1",
  email: "user@example.com",
  password_hash: "hash",
  name: "Member",
  avatar_url: null,
  created_at: TEST_TIMESTAMP,
  updated_at: TEST_TIMESTAMP,
};

const getPageMock = vi.mocked(getPage);
const checkMembershipMock = vi.mocked(checkMembership);
const canAccessPageMock = vi.mocked(canAccessPage);

type LinkPrincipalArgs = { type: "link"; token: string };
type UserPrincipalArgs = { type: "user"; userId: string };
type PrincipalArg = LinkPrincipalArgs | UserPrincipalArgs;

function isLinkPrincipal(principal: PrincipalArg): principal is LinkPrincipalArgs {
  return principal.type === "link";
}

function isUserPrincipal(principal: PrincipalArg): principal is UserPrincipalArgs {
  return principal.type === "user";
}

function createUpload(overrides: Partial<typeof uploads.$inferSelect> = {}): typeof uploads.$inferSelect {
  return {
    id: "upload-1",
    workspace_id: "ws-1",
    page_id: "page-1",
    uploaded_by: "user-share-creator",
    r2_key: "uploads/u",
    filename: "f.png",
    content_type: "image/png",
    size_bytes: 1024,
    created_at: TEST_TIMESTAMP,
    ...overrides,
  };
}

function createPage(overrides: Partial<typeof pages.$inferSelect> = {}): typeof pages.$inferSelect {
  return {
    id: "page-1",
    workspace_id: "ws-1",
    kind: "doc",
    title: "T",
    parent_id: null,
    position: 0,
    icon: null,
    cover_url: null,
    created_by: "user-1",
    archived_at: null,
    created_at: TEST_TIMESTAMP,
    updated_at: TEST_TIMESTAMP,
    ...overrides,
  };
}

function createDbMock(options: {
  upload?: typeof uploads.$inferSelect;
  pageShareRow?: { created_by: string };
  captureInsert?: (values: unknown) => void;
}) {
  const uploadRow = options.upload;
  const pageShareRow = options.pageShareRow;

  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: unknown) => {
      if (table === uploads) {
        return { where: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue(uploadRow) }) };
      }
      if (table === pageShares) {
        return { where: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue(pageShareRow) }) };
      }
      throw new Error(`Unexpected table in db select mock: ${String(table)}`);
    }),
  }));

  const insert = vi.fn().mockImplementation(() => ({
    values: vi.fn().mockImplementation(async (values: unknown) => {
      options.captureInsert?.(values);
    }),
  }));

  return { select, insert };
}

const R2_MOCK = {
  head: vi.fn().mockResolvedValue(null),
  put: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue({ body: new ReadableStream(), size: 1024 }),
};

describe("uploads: shared-surface precedence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    R2_MOCK.head.mockResolvedValue(null);
    R2_MOCK.put.mockResolvedValue(undefined);
    R2_MOCK.get.mockResolvedValue({ body: new ReadableStream(), size: 1024 });
    getPageMock.mockResolvedValue(createPage());
    authState.user = MEMBER_USER;
  });

  describe("POST /workspaces/:wid/uploads/presign", () => {
    it("member with ?share= on a page the share does not grant edit is denied", async () => {
      checkMembershipMock.mockResolvedValue(createMembership("member"));
      canAccessPageMock.mockImplementation(async (_db, principal) => {
        // Share principal: deny (simulating a view-only share)
        if (isLinkPrincipal(principal)) return false;
        return true; // Canonical member check would authorize
      });

      const { uploadsRouter } = await import("@/worker/routes/uploads");
      const db = createDbMock({});
      const app = await createTestApp(uploadsRouter, "/api/v1", { db, env: { R2: R2_MOCK } });

      const res = await app.request("/api/v1/workspaces/ws-1/uploads/presign?share=tok", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: "f.png",
          content_type: "image/png",
          size_bytes: 1024,
          page_id: "page-1",
        }),
      });

      expect(res.status).toBe(403);
      const linkCalls = canAccessPageMock.mock.calls.filter((call) => isLinkPrincipal(call[1] as PrincipalArg));
      const memberCalls = canAccessPageMock.mock.calls.filter((call) => isUserPrincipal(call[1] as PrincipalArg));
      expect(linkCalls.length).toBeGreaterThan(0);
      expect(memberCalls).toHaveLength(0);
    });

    it("member with ?share= granting edit uses share principal provenance (not member id)", async () => {
      checkMembershipMock.mockResolvedValue(createMembership("member"));
      canAccessPageMock.mockResolvedValue(true);
      const captured: { uploaded_by?: string } = {};

      const { uploadsRouter } = await import("@/worker/routes/uploads");
      const db = createDbMock({
        pageShareRow: { created_by: "user-share-creator" },
        captureInsert: (values) => {
          const row = values as { uploaded_by: string };
          captured.uploaded_by = row.uploaded_by;
        },
      });
      const app = await createTestApp(uploadsRouter, "/api/v1", { db, env: { R2: R2_MOCK } });

      const res = await app.request("/api/v1/workspaces/ws-1/uploads/presign?share=tok", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: "f.png",
          content_type: "image/png",
          size_bytes: 1024,
          page_id: "page-1",
        }),
      });

      expect(res.status).toBe(200);
      expect(captured.uploaded_by).toBe("user-share-creator");
    });

    it("member without ?share= uses canonical member path (unchanged)", async () => {
      checkMembershipMock.mockResolvedValue(createMembership("member"));
      canAccessPageMock.mockResolvedValue(true);
      const captured: { uploaded_by?: string } = {};

      const { uploadsRouter } = await import("@/worker/routes/uploads");
      const db = createDbMock({
        captureInsert: (values) => {
          const row = values as { uploaded_by: string };
          captured.uploaded_by = row.uploaded_by;
        },
      });
      const app = await createTestApp(uploadsRouter, "/api/v1", { db, env: { R2: R2_MOCK } });

      const res = await app.request("/api/v1/workspaces/ws-1/uploads/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: "f.png",
          content_type: "image/png",
          size_bytes: 1024,
          page_id: "page-1",
        }),
      });

      expect(res.status).toBe(200);
      expect(captured.uploaded_by).toBe("user-1");
    });
  });

  describe("PUT /uploads/:id/data", () => {
    it("member with ?share= authorizes via share principal, not uploaded_by match", async () => {
      checkMembershipMock.mockResolvedValue(createMembership("member"));
      canAccessPageMock.mockResolvedValue(true);

      const { uploadServingRouter } = await import("@/worker/routes/uploads");
      const db = createDbMock({ upload: createUpload({ uploaded_by: "user-share-creator" }) });
      const app = await createTestApp(uploadServingRouter, "/uploads", { db, env: { R2: R2_MOCK } });

      const res = await app.request("/uploads/upload-1/data?share=tok", {
        method: "PUT",
        headers: { "content-type": "image/png", cookie: "bland_refresh=t" },
        body: new Uint8Array([1, 2, 3, 4]),
      });

      expect(res.status).toBe(200);
      const linkCalls = canAccessPageMock.mock.calls.filter((call) => isLinkPrincipal(call[1] as PrincipalArg));
      expect(linkCalls.length).toBeGreaterThan(0);
    });

    it("member with ?share= where share denies edit is denied (even if member has canonical edit)", async () => {
      checkMembershipMock.mockResolvedValue(createMembership("member"));
      canAccessPageMock.mockImplementation(async (_db, principal) => {
        if (isLinkPrincipal(principal)) return false;
        return true;
      });

      const { uploadServingRouter } = await import("@/worker/routes/uploads");
      const db = createDbMock({ upload: createUpload({ uploaded_by: "user-1" }) });
      const app = await createTestApp(uploadServingRouter, "/uploads", { db, env: { R2: R2_MOCK } });

      const res = await app.request("/uploads/upload-1/data?share=tok", {
        method: "PUT",
        headers: { "content-type": "image/png", cookie: "bland_refresh=t" },
        body: new Uint8Array([1, 2, 3, 4]),
      });

      expect(res.status).toBe(403);
    });
  });

  describe("GET /uploads/:id", () => {
    it("member with ?share= and view grant serves via share principal first", async () => {
      canAccessPageMock.mockImplementation(async (_db, principal) => {
        return isLinkPrincipal(principal);
      });

      const { uploadServingRouter } = await import("@/worker/routes/uploads");
      const db = createDbMock({ upload: createUpload() });
      const app = await createTestApp(uploadServingRouter, "/uploads", { db, env: { R2: R2_MOCK, JWT_SECRET: "s" } });

      const res = await app.request("/uploads/upload-1?share=tok", { headers: { cookie: "bland_refresh=t" } });

      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("private, max-age=300, must-revalidate");
      const firstCall = canAccessPageMock.mock.calls[0];
      expect(firstCall[1]).toEqual({ type: "link", token: "tok" });
    });

    it("member with ?share= but the share denies returns 401 (no canonical fallback)", async () => {
      canAccessPageMock.mockResolvedValue(false);
      checkMembershipMock.mockResolvedValue(createMembership("member"));

      const { uploadServingRouter } = await import("@/worker/routes/uploads");
      const db = createDbMock({ upload: createUpload() });
      const app = await createTestApp(uploadServingRouter, "/uploads", { db, env: { R2: R2_MOCK, JWT_SECRET: "s" } });

      const res = await app.request("/uploads/upload-1?share=tok", { headers: { cookie: "bland_refresh=t" } });

      expect(res.status).toBe(401);
    });

    it("workspace-level asset (no page_id) keeps long Cache-Control", async () => {
      checkMembershipMock.mockResolvedValue(createMembership("member"));

      const { uploadServingRouter } = await import("@/worker/routes/uploads");
      const db = createDbMock({ upload: createUpload({ page_id: null }) });
      const app = await createTestApp(uploadServingRouter, "/uploads", { db, env: { R2: R2_MOCK, JWT_SECRET: "s" } });

      const res = await app.request("/uploads/upload-1", { headers: { cookie: "bland_refresh=t" } });

      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
    });
  });
});
