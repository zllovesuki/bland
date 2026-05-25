import { env } from "cloudflare:workers";
import { createExecutionContext, createMessageBatch, getQueueResult } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import worker from "@/worker/index";
import type { TasksQueueMessage } from "@/worker/queues/messages";

async function clearSitesBucket(): Promise<void> {
  const listing = await env.SITES.list();
  await Promise.all(listing.objects.map((object) => env.SITES.delete(object.key)));
}

describe("worker queue dispatch", () => {
  beforeEach(async () => {
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
});
