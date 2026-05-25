import { env } from "cloudflare:workers";
import { createExecutionContext, createMessageBatch, getQueueResult } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { GRADIENT_PRESETS } from "@/shared/page-cover";
import worker from "@/worker/index";
import type { TasksQueueMessage } from "@/worker/queues/messages";
import { siteCoverKey } from "@/worker/sites/cover";
import { resetD1Tables } from "@tests/worker/helpers/db";
import { seedPage, seedUser, seedWorkspace } from "@tests/worker/helpers/seeds";

async function clearSitesBucket(): Promise<void> {
  const listing = await env.SITES.list();
  await Promise.all(listing.objects.map((object) => env.SITES.delete(object.key)));
}

describe("worker queue dispatch", () => {
  beforeEach(async () => {
    await resetD1Tables();
    await clearSitesBucket();
  });

  it("dispatches workspace Sites cleanup messages and acknowledges the batch", async () => {
    await env.SITES.put("ws-clean/page-a.json", "{}");
    await env.SITES.put("ws-clean/page-b.json", "{}");
    await env.SITES.put("ws-keep/page-c.json", "{}");

    const batch = createMessageBatch<TasksQueueMessage>("bland-tasks", [
      {
        id: "cleanup-1",
        timestamp: new Date("2026-05-24T00:00:00.000Z"),
        attempts: 1,
        body: { type: "workspace-sites-cleanup", workspaceId: "ws-clean" },
      },
    ]);
    const ctx = createExecutionContext();

    expect(worker.queue).toBeDefined();
    await worker.queue!(batch, env, ctx);
    const result = await getQueueResult(batch, ctx);

    expect(result.retryMessages).toHaveLength(0);
    expect(result.explicitAcks).toEqual(["cleanup-1"]);
    await expect(env.SITES.get("ws-clean/page-a.json")).resolves.toBeNull();
    await expect(env.SITES.get("ws-clean/page-b.json")).resolves.toBeNull();
    await expect(env.SITES.get("ws-keep/page-c.json")).resolves.not.toBeNull();
  });

  it("dispatches site cover messages and acknowledges the batch", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, cover_url: GRADIENT_PRESETS[0] });

    const batch = createMessageBatch<TasksQueueMessage>("bland-tasks", [
      {
        id: "cover-1",
        timestamp: new Date("2026-05-24T00:00:00.000Z"),
        attempts: 1,
        body: { type: "site-cover", pageId: page.id },
      },
    ]);
    const ctx = createExecutionContext();

    await worker.queue!(batch, env, ctx);
    const result = await getQueueResult(batch, ctx);

    expect(result.retryMessages).toHaveLength(0);
    expect(result.explicitAcks).toEqual(["cover-1"]);
    await expect(env.SITES.get(siteCoverKey(ws.id, page.id))).resolves.not.toBeNull();
  });
});
