import { describe, expect, it, vi, beforeEach } from "vitest";

import { resolvePrincipal, resolvePageAccessLevels } from "@/worker/lib/permissions";
import { getPage } from "@/worker/lib/page-access";
import { mockAuthMiddleware, mockRateLimitMiddleware, createTestApp } from "@tests/worker/util/mocks";

vi.mock("@/worker/lib/permissions", () => ({
  resolvePrincipal: vi.fn(),
  resolvePageAccessLevels: vi.fn(),
}));
vi.mock("@/worker/lib/page-access", () => ({ getPage: vi.fn() }));
vi.mock("@/worker/middleware/auth", () => mockAuthMiddleware());
vi.mock("@/worker/middleware/rate-limit", () => mockRateLimitMiddleware());
vi.mock("@/worker/lib/ai", async () => {
  const actual = await vi.importActual<typeof import("@/worker/lib/ai")>("@/worker/lib/ai");
  return {
    ...actual,
    createAiClient: vi.fn(() => ({
      async chat() {
        return (async function* () {
          yield { type: "chunk", text: "ok" } as const;
        })();
      },
      async summarize() {
        return { summary: "mocked summary" };
      },
    })),
  };
});

const resolvePrincipalMock = vi.mocked(resolvePrincipal);
const resolvePageAccessLevelsMock = vi.mocked(resolvePageAccessLevels);
const getPageMock = vi.mocked(getPage);

type AccessLevel = "none" | "view" | "edit";

function seedPrincipal(memberBypass: boolean) {
  resolvePrincipalMock.mockResolvedValue({
    principal: { kind: "user", id: "user-1" } as never,
    memberBypass,
  });
}

function seedPage(pageId = "pg-1") {
  getPageMock.mockResolvedValue({ id: pageId, workspace_id: "ws-1", archived_at: null } as never);
}

function seedAccess(level: AccessLevel, pageId = "pg-1") {
  resolvePageAccessLevelsMock.mockResolvedValue(new Map([[pageId, level]]));
}

function createAiEnv(bodyText = "Hello, this is the body of the page.") {
  const getIndexPayload = vi.fn().mockResolvedValue({ kind: "found", title: "Page", bodyText });
  return {
    env: {
      DocSync: { getByName: vi.fn().mockReturnValue({ getIndexPayload }) },
    },
    getIndexPayload,
  };
}

async function buildApp(env: ReturnType<typeof createAiEnv>["env"]) {
  const { aiRouter } = await import("@/worker/routes/ai");
  return createTestApp(aiRouter, "/api/v1", { env });
}

function rewritePayload() {
  return {
    action: "proofread",
    selectedText: "hi",
    parentBlock: "hi",
    beforeBlock: "",
    afterBlock: "",
    pageTitle: "",
  };
}

const REWRITE_URL = "/api/v1/workspaces/ws-1/pages/pg-1/rewrite";

describe("ai entitlement gating", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when no principal can be resolved", async () => {
    resolvePrincipalMock.mockResolvedValue(null);
    const { env } = createAiEnv();
    const app = await buildApp(env);
    const res = await app.request(REWRITE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rewritePayload()),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "unauthorized" });
  });

  it("returns 403 ai_not_entitled for a shared-surface viewer attempting rewrite", async () => {
    seedPrincipal(false);
    seedPage();
    seedAccess("view");
    const { env } = createAiEnv();
    const app = await buildApp(env);
    const res = await app.request(REWRITE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rewritePayload()),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "ai_not_entitled" });
  });

  it("returns 403 ai_not_entitled for a canonical viewer (view-only) attempting rewrite", async () => {
    seedPrincipal(true);
    seedPage();
    seedAccess("view");
    const { env } = createAiEnv();
    const app = await buildApp(env);
    const res = await app.request(REWRITE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rewritePayload()),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "ai_not_entitled" });
  });

  it("allows a canonical viewer to summarize", async () => {
    seedPrincipal(true);
    seedPage();
    seedAccess("view");
    const { env } = createAiEnv();
    const app = await buildApp(env);
    const res = await app.request("/api/v1/workspaces/ws-1/pages/pg-1/summarize", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ summary: "mocked summary" });
  });

  it("allows a canonical editor to rewrite", async () => {
    seedPrincipal(true);
    seedPage();
    seedAccess("edit");
    const { env } = createAiEnv();
    const app = await buildApp(env);
    const res = await app.request(REWRITE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rewritePayload()),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });

  it("returns 404 not_found when the page does not exist", async () => {
    seedPrincipal(true);
    getPageMock.mockResolvedValue(undefined as never);
    const { env } = createAiEnv();
    const app = await buildApp(env);
    const res = await app.request(REWRITE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rewritePayload()),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "not_found" });
  });

  it("returns 404 not_found when access level is none (no existence leak)", async () => {
    seedPrincipal(true);
    seedPage();
    seedAccess("none");
    const { env } = createAiEnv();
    const app = await buildApp(env);
    const res = await app.request(REWRITE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rewritePayload()),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "not_found" });
  });
});

describe("ai empty-page gating", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 page_empty on /ask when the page body is empty", async () => {
    seedPrincipal(true);
    seedPage();
    seedAccess("edit");
    const { env } = createAiEnv("");
    const app = await buildApp(env);
    const res = await app.request("/api/v1/workspaces/ws-1/pages/pg-1/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "What is this?" }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "page_empty" });
  });

  it("returns 404 page_empty on /summarize when the page body is empty", async () => {
    seedPrincipal(true);
    seedPage();
    seedAccess("view");
    const { env } = createAiEnv("");
    const app = await buildApp(env);
    const res = await app.request("/api/v1/workspaces/ws-1/pages/pg-1/summarize", {
      method: "POST",
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "page_empty" });
  });

  it("returns 404 page_empty on /ask when getIndexPayload says missing", async () => {
    seedPrincipal(true);
    seedPage();
    seedAccess("edit");
    const getIndexPayload = vi.fn().mockResolvedValue({ kind: "missing" });
    const env = { DocSync: { getByName: vi.fn().mockReturnValue({ getIndexPayload }) } };
    const app = await buildApp(env);
    const res = await app.request("/api/v1/workspaces/ws-1/pages/pg-1/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "hi" }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "page_empty" });
  });
});
