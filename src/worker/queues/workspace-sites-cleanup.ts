import { createLogger } from "@/worker/lib/logger";
import type { TasksQueueResult } from "./messages";

const log = createLogger("workspace-sites-cleanup");

export async function handleWorkspaceSitesCleanup(
  workspaceId: string,
  env: Pick<Env, "SITES">,
): Promise<TasksQueueResult> {
  const prefix = `${workspaceId}/`;
  let cursor: string | undefined;
  let deletedObjects = 0;
  let batches = 0;

  do {
    const listing = await env.SITES.list({ prefix, cursor });
    if (listing.objects.length > 0) {
      await env.SITES.delete(listing.objects.map((object) => object.key));
      deletedObjects += listing.objects.length;
      batches += 1;
    }
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);

  log.info("sites_cleanup_completed", { workspaceId, deletedObjects, batches });
  return { kind: "ok" };
}
