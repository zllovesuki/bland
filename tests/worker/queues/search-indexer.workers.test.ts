import { env } from "cloudflare:workers";
import { ulid } from "ulid";
import { beforeEach, describe, expect, it } from "vitest";

import { handleSearchIndexMessage } from "@/worker/queues/search-indexer";
import { resetD1Tables } from "@tests/worker/helpers/db";
import { runInWorkspaceIndexer } from "@tests/worker/helpers/do";
import { seedPage, seedUser, seedWorkspace } from "@tests/worker/helpers/seeds";

async function searchIndexerHas(workspaceId: string, query: string, pageId: string): Promise<boolean> {
  return runInWorkspaceIndexer(workspaceId, async (instance) => {
    const stub = instance as { search(query: string, limit: number): Promise<{ items: { pageId: string }[] }> };
    const res = await stub.search(query, 10);
    return res.items.some((item) => item.pageId === pageId);
  });
}

async function clearIndexer(workspaceId: string): Promise<void> {
  await runInWorkspaceIndexer(workspaceId, async (instance) => {
    const stub = instance as { clear(): Promise<unknown> };
    await stub.clear();
  });
}

describe("handleSearchIndexMessage", () => {
  beforeEach(async () => {
    await resetD1Tables();
  });

  it("returns retry with delay when the page is not yet visible in D1", async () => {
    const result = await handleSearchIndexMessage({ type: "index-page", pageId: ulid() }, env);
    expect(result).toEqual({ kind: "retry", delaySeconds: 2, reason: "page_not_yet_visible" });
  });

  it("returns ok and removes the page from the index when archived", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({
      workspace_id: ws.id,
      created_by: owner.id,
      title: "Soon archived",
    });

    // Pre-seed an entry to prove removal happens.
    await runInWorkspaceIndexer(ws.id, async (instance) => {
      const stub = instance as { indexPage(id: string, title: string, body: string): Promise<unknown> };
      await stub.indexPage(page.id, "Soon archived", "soon archived body");
    });
    expect(await searchIndexerHas(ws.id, "Soon archived", page.id)).toBe(true);

    // Now mark archived in D1 and run the consumer.
    await env.DB.prepare("UPDATE pages SET archived_at = ? WHERE id = ?")
      .bind("2026-04-23T00:00:00.000Z", page.id)
      .run();

    const result = await handleSearchIndexMessage({ type: "index-page", pageId: page.id }, env);
    expect(result).toEqual({ kind: "ok" });
    expect(await searchIndexerHas(ws.id, "Soon archived", page.id)).toBe(false);

    await clearIndexer(ws.id);
  });

  it("returns ok and indexes by D1 title when the DocSync snapshot is missing", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({
      workspace_id: ws.id,
      created_by: owner.id,
      title: "Unique indexed title",
    });

    const result = await handleSearchIndexMessage({ type: "index-page", pageId: page.id }, env);
    expect(result).toEqual({ kind: "ok" });
    expect(await searchIndexerHas(ws.id, "Unique indexed title", page.id)).toBe(true);

    await clearIndexer(ws.id);
  });
});
