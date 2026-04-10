import { describe, expect, it, vi, beforeEach } from "vitest";
import { z } from "zod";

import { checkMembership } from "@/worker/lib/membership";
import { SearchResult } from "@/shared/types";
import { mockAuthMiddleware, mockRateLimitMiddleware, createTestApp } from "@tests/worker/util/mocks";
import { createMembership } from "@tests/worker/util/fixtures";
import { ApiErrorResponse } from "@tests/worker/util/schemas";

vi.mock("@/worker/lib/membership", () => ({ checkMembership: vi.fn() }));
vi.mock("@/worker/lib/permissions", () => ({ canAccessPages: vi.fn().mockResolvedValue(new Map()) }));
vi.mock("@/worker/middleware/auth", () => mockAuthMiddleware());
vi.mock("@/worker/middleware/rate-limit", () => mockRateLimitMiddleware());

const checkMembershipMock = vi.mocked(checkMembership);

const SearchResponse = z.object({ results: z.array(SearchResult) });

function createMockWorkspaceIndexerEnv() {
  const search = vi.fn().mockResolvedValue({ kind: "results", items: [] });
  return {
    env: {
      WorkspaceIndexer: {
        getByName: vi.fn().mockReturnValue({ search }),
      },
    },
    search,
  };
}

describe("search: membership gating", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty results for non-members without accessible hits", async () => {
    checkMembershipMock.mockResolvedValue(null);

    const { searchRouter } = await import("@/worker/routes/search");
    const { env, search } = createMockWorkspaceIndexerEnv();
    const app = await createTestApp(searchRouter, "/api/v1", { env });

    const res = await app.request("/api/v1/workspaces/ws-1/search?q=test");
    expect(res.status).toBe(200);
    expect(SearchResponse.parse(await res.json()).results).toEqual([]);
    expect(search).toHaveBeenCalledWith("test", 100);
  });

  it("allows workspace members to search", async () => {
    checkMembershipMock.mockResolvedValue(createMembership("member"));

    const { searchRouter } = await import("@/worker/routes/search");
    const { env, search } = createMockWorkspaceIndexerEnv();
    const app = await createTestApp(searchRouter, "/api/v1", { env });

    const res = await app.request("/api/v1/workspaces/ws-1/search?q=test");
    expect(res.status).toBe(200);
    expect(SearchResponse.parse(await res.json()).results).toEqual([]);
    expect(search).toHaveBeenCalledWith("test", 50);
  });

  it("allows guest members to search (with post-filtering)", async () => {
    checkMembershipMock.mockResolvedValue(createMembership("guest"));

    const { searchRouter } = await import("@/worker/routes/search");
    const { env, search } = createMockWorkspaceIndexerEnv();
    const app = await createTestApp(searchRouter, "/api/v1", { env });

    const res = await app.request("/api/v1/workspaces/ws-1/search?q=test");
    expect(res.status).toBe(200);
    expect(SearchResponse.parse(await res.json()).results).toEqual([]);
    expect(search).toHaveBeenCalledWith("test", 100);
  });
});
