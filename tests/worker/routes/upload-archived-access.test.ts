import { describe, expect, it, vi, beforeEach } from "vitest";

import { pages, uploads } from "@/worker/db/schema";
import { getPage } from "@/worker/lib/page-access";
import { checkMembership } from "@/worker/lib/membership";
import {
  mockJose,
  mockAuthHelpers,
  mockAuthMiddleware,
  mockRateLimitMiddleware,
  createSelectMock,
  createTestApp,
} from "@tests/worker/util/mocks";
import { createMembership, TEST_TIMESTAMP } from "@tests/worker/util/fixtures";
import { ApiErrorResponse } from "@tests/worker/util/schemas";

vi.mock("@/worker/lib/page-access", () => ({ getPage: vi.fn() }));
vi.mock("@/worker/lib/membership", () => ({ checkMembership: vi.fn() }));
vi.mock("jose", () => mockJose());
vi.mock("@/worker/lib/auth", () => mockAuthHelpers());
vi.mock("@/worker/middleware/auth", () => mockAuthMiddleware());
vi.mock("@/worker/middleware/rate-limit", () => mockRateLimitMiddleware());

const getPageMock = vi.mocked(getPage);
const checkMembershipMock = vi.mocked(checkMembership);

function createUpload(overrides: Partial<typeof uploads.$inferSelect> = {}): typeof uploads.$inferSelect {
  return {
    id: "upload-1",
    workspace_id: "ws-1",
    page_id: null,
    uploaded_by: "user-1",
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

const MEMBER = createMembership();
const R2_MOCK = { get: vi.fn().mockResolvedValue({ body: new ReadableStream(), size: 1024 }) };

describe("upload serving: archived page access", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 for page-scoped uploads when the linked page is archived", async () => {
    checkMembershipMock.mockResolvedValue(MEMBER);
    getPageMock.mockResolvedValue(undefined);

    const { uploadServingRouter } = await import("@/worker/routes/uploads");
    const app = await createTestApp(uploadServingRouter, "/uploads", {
      db: createSelectMock(createUpload({ id: "u-1", page_id: "page-1" })),
      env: { R2: R2_MOCK, JWT_SECRET: "s" },
    });

    const res = await app.request("/uploads/u-1", { headers: { cookie: "bland_refresh=t" } });
    expect(res.status).toBe(404);
    expect(ApiErrorResponse.parse(await res.json()).error).toBe("not_found");
  });

  it("serves workspace-level uploads (no page_id) without archive check", async () => {
    checkMembershipMock.mockResolvedValue(MEMBER);

    const { uploadServingRouter } = await import("@/worker/routes/uploads");
    const app = await createTestApp(uploadServingRouter, "/uploads", {
      db: createSelectMock(createUpload({ id: "u-2" })),
      env: { R2: R2_MOCK, JWT_SECRET: "s" },
    });

    const res = await app.request("/uploads/u-2", { headers: { cookie: "bland_refresh=t" } });
    expect(res.status).toBe(200);
    expect(getPageMock).not.toHaveBeenCalled();
  });

  it("returns 404 for archived page-scoped uploads via share-token auth", async () => {
    getPageMock.mockResolvedValue(undefined);

    const { uploadServingRouter } = await import("@/worker/routes/uploads");
    const app = await createTestApp(uploadServingRouter, "/uploads", {
      db: createSelectMock(createUpload({ id: "u-share", page_id: "page-1" })),
      env: { R2: R2_MOCK, JWT_SECRET: "s" },
    });

    const res = await app.request("/uploads/u-share?share=t");
    expect(res.status).toBe(404);
    expect(ApiErrorResponse.parse(await res.json()).error).toBe("not_found");
  });

  it("serves page-scoped uploads when the page is not archived", async () => {
    checkMembershipMock.mockResolvedValue(MEMBER);
    getPageMock.mockResolvedValue(createPage());

    const { uploadServingRouter } = await import("@/worker/routes/uploads");
    const app = await createTestApp(uploadServingRouter, "/uploads", {
      db: createSelectMock(createUpload({ id: "u-3", page_id: "page-1" })),
      env: { R2: R2_MOCK, JWT_SECRET: "s" },
    });

    const res = await app.request("/uploads/u-3", { headers: { cookie: "bland_refresh=t" } });
    expect(res.status).toBe(200);
    expect(getPageMock).toHaveBeenCalledWith(expect.anything(), "page-1", "ws-1");
  });
});
