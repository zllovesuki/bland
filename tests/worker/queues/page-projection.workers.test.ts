import { env } from "cloudflare:workers";
import { ulid } from "ulid";
import { beforeEach, describe, expect, it } from "vitest";

import { handlePageProjection } from "@/worker/queues/page-projection";
import { buildSiteR2ObjectKey, readSiteR2 } from "@/worker/sites/cache";
import { resetD1Tables } from "@tests/worker/helpers/db";
import { buildYjsDocBytes, seedDocSyncSnapshot } from "@tests/worker/helpers/do";
import { seedPage, seedUser, seedWorkspace } from "@tests/worker/helpers/seeds";

async function clearSitesBucket(): Promise<void> {
  const listing = await env.SITES.list();
  await Promise.all(listing.objects.map((object) => env.SITES.delete(object.key)));
}

describe("handlePageProjection", () => {
  beforeEach(async () => {
    await resetD1Tables();
    await clearSitesBucket();
  });

  it("returns retry when the page is not yet visible in D1", async () => {
    await expect(handlePageProjection(ulid(), env)).resolves.toEqual({ kind: "retry", delaySeconds: 2 });
  });

  it("projects a doc snapshot into the Sites R2 envelope", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Projected" });
    await seedDocSyncSnapshot(page.id, buildYjsDocBytes("Projected", "Projected body text"));

    await expect(handlePageProjection(page.id, env)).resolves.toEqual({ kind: "ok" });

    const r2 = await readSiteR2(env, ws.id, page.id, page.updated_at);
    expect(r2?.fresh).toBe(true);
    expect(r2?.envelope?.updatedAt).toBe(page.updated_at);
    expect(JSON.stringify(r2?.envelope?.content)).toContain("Projected body text");
    expect(r2?.envelope?.metrics).toEqual({ words: 3, characters: 19 });
  });

  it("writes an empty envelope when a doc snapshot is missing", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Empty" });

    await expect(handlePageProjection(page.id, env)).resolves.toEqual({ kind: "ok" });

    const r2 = await readSiteR2(env, ws.id, page.id, page.updated_at);
    expect(r2?.fresh).toBe(true);
    expect(r2?.envelope).toEqual({
      content: { type: "doc", content: [] },
      metrics: { words: 0, characters: 0 },
      updatedAt: page.updated_at,
    });
  });

  it("skips canvas pages", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const canvas = await seedPage({ workspace_id: ws.id, created_by: owner.id, kind: "canvas", title: "Canvas" });

    await expect(handlePageProjection(canvas.id, env)).resolves.toEqual({ kind: "ok" });
    await expect(env.SITES.get(buildSiteR2ObjectKey(ws.id, canvas.id))).resolves.toBeNull();
  });
});
