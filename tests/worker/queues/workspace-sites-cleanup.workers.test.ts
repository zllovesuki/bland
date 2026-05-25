import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { handleWorkspaceSitesCleanup } from "@/worker/queues/workspace-sites-cleanup";
import { siteCoverKey } from "@/worker/sites/cover";

async function clearSitesBucket(): Promise<void> {
  const listing = await env.SITES.list();
  await Promise.all(listing.objects.map((object) => env.SITES.delete(object.key)));
}

describe("handleWorkspaceSitesCleanup", () => {
  beforeEach(async () => {
    await clearSitesBucket();
  });

  it("deletes every Sites artifact under the workspace prefix", async () => {
    const coverKey = siteCoverKey("ws-one", "page-cover");
    const otherWorkspaceCoverKey = siteCoverKey("ws-two", "page-cover");
    await env.SITES.put("ws-one/page-a.json", "{}");
    await env.SITES.put("ws-one/page-b.json", "{}");
    await env.SITES.put(coverKey, "PNG");
    await env.SITES.put("ws-two/page-c.json", "{}");
    await env.SITES.put(otherWorkspaceCoverKey, "PNG");

    await expect(handleWorkspaceSitesCleanup("ws-one", env)).resolves.toEqual({ kind: "ok" });

    await expect(env.SITES.get("ws-one/page-a.json")).resolves.toBeNull();
    await expect(env.SITES.get("ws-one/page-b.json")).resolves.toBeNull();
    await expect(env.SITES.get(coverKey)).resolves.toBeNull();
    await expect(env.SITES.get("ws-two/page-c.json")).resolves.not.toBeNull();
    await expect(env.SITES.get(otherWorkspaceCoverKey)).resolves.not.toBeNull();
  });
});
