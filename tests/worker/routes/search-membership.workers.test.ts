import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { SearchResult } from "@/shared/types";
import { resetD1Tables } from "@tests/worker/helpers/db";
import { apiRequest } from "@tests/worker/helpers/request";
import { seedMembership, seedPage, seedPageShare, seedUser, seedWorkspace } from "@tests/worker/helpers/seeds";

const SearchResponse = z.object({ results: z.array(SearchResult) });

async function indexPage(workspaceId: string, pageId: string, title: string, bodyText: string): Promise<void> {
  const stub = env.WorkspaceIndexer.getByName(workspaceId);
  const result = await stub.indexPage(pageId, title, bodyText);
  if (result.kind !== "indexed") {
    throw new Error(`indexPage failed for ${pageId}: ${JSON.stringify(result)}`);
  }
}

async function clearIndex(workspaceId: string): Promise<void> {
  const stub = env.WorkspaceIndexer.getByName(workspaceId);
  await stub.clear();
}

describe("GET /workspaces/:wid/search - membership gating", () => {
  beforeEach(async () => {
    await resetD1Tables();
  });

  it("returns empty results for non-members with no accessible hits", async () => {
    const owner = await seedUser();
    const outsider = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Alpha" });
    await clearIndex(ws.id);
    await indexPage(ws.id, page.id, "Alpha", "something about testing");

    const res = await apiRequest(`/api/v1/workspaces/${ws.id}/search`, {
      search: { q: "testing" },
      userId: outsider.id,
    });

    expect(res.status).toBe(200);
    const body = SearchResponse.parse(await res.json());
    expect(body.results).toEqual([]);
  });

  it("returns matching pages for full workspace members", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Alpha" });
    await clearIndex(ws.id);
    await indexPage(ws.id, page.id, "Alpha", "unique-search-keyword-for-members");

    const res = await apiRequest(`/api/v1/workspaces/${ws.id}/search`, {
      search: { q: "unique-search-keyword-for-members" },
      userId: member.id,
    });

    expect(res.status).toBe(200);
    const body = SearchResponse.parse(await res.json());
    expect(body.results).toHaveLength(1);
    expect(body.results[0].page_id).toBe(page.id);
    expect(body.results[0].title).toBe("Alpha");
  });

  it("excludes archived pages from member results", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
    const livePage = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Live" });
    const archivedPage = await seedPage({
      workspace_id: ws.id,
      created_by: owner.id,
      title: "Old",
      archived_at: "2026-04-01T00:00:00.000Z",
    });
    await clearIndex(ws.id);
    await indexPage(ws.id, livePage.id, "Live", "archive-gating-live-keyword");
    await indexPage(ws.id, archivedPage.id, "Old", "archive-gating-live-keyword");

    const res = await apiRequest(`/api/v1/workspaces/${ws.id}/search`, {
      search: { q: "archive-gating-live-keyword" },
      userId: member.id,
    });

    expect(res.status).toBe(200);
    const body = SearchResponse.parse(await res.json());
    expect(body.results.map((r) => r.page_id)).toEqual([livePage.id]);
  });

  it("post-filters guest results by per-page share access", async () => {
    const owner = await seedUser();
    const guest = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: guest.id, workspace_id: ws.id, role: "guest" });
    const sharedWithGuest = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Granted" });
    const hiddenFromGuest = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Secret" });
    await seedPageShare({
      page_id: sharedWithGuest.id,
      created_by: owner.id,
      grantee_type: "user",
      grantee_id: guest.id,
      permission: "view",
    });
    await clearIndex(ws.id);
    await indexPage(ws.id, sharedWithGuest.id, "Granted", "guest-post-filter-keyword");
    await indexPage(ws.id, hiddenFromGuest.id, "Secret", "guest-post-filter-keyword");

    const res = await apiRequest(`/api/v1/workspaces/${ws.id}/search`, {
      search: { q: "guest-post-filter-keyword" },
      userId: guest.id,
    });

    expect(res.status).toBe(200);
    const body = SearchResponse.parse(await res.json());
    expect(body.results.map((r) => r.page_id)).toEqual([sharedWithGuest.id]);
  });
});
