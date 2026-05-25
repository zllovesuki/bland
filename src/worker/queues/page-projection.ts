import { eq } from "drizzle-orm";

import { createSessionDb } from "@/worker/db/d1/client";
import { pages } from "@/worker/db/d1/schema";
import { createLogger } from "@/worker/lib/logger";
import { writeSiteR2 } from "@/worker/sites/cache";
import type { TasksQueueResult } from "./messages";

const log = createLogger("page-projection");

export async function handlePageProjection(pageId: string, env: Env): Promise<TasksQueueResult> {
  const { db } = createSessionDb(env.DB, "first-primary");
  const page = await db
    .select({ workspace_id: pages.workspace_id, kind: pages.kind, updated_at: pages.updated_at })
    .from(pages)
    .where(eq(pages.id, pageId))
    .get();

  if (!page) {
    log.info("sites_projection_retry", { pageId, reason: "page_not_yet_visible" });
    return { kind: "retry", delaySeconds: 2 };
  }
  if (page.kind !== "doc") {
    log.info("sites_projection_skipped", { pageId, workspaceId: page.workspace_id, kind: page.kind });
    return { kind: "ok" };
  }

  // ADR: keep Tiptap/y-tiptap projection out of Worker startup.
  const { projectPageJson } = await import("@/worker/sites/project-page-json");
  const projected = await projectPageJson(env, pageId);
  if (!projected) {
    log.info("sites_projection_skipped", { pageId, workspaceId: page.workspace_id, reason: "snapshot_missing" });
    return { kind: "ok" };
  }

  await writeSiteR2(env, page.workspace_id, pageId, {
    content: projected.content,
    metrics: projected.metrics,
    updatedAt: page.updated_at,
  });
  log.info("sites_projected", {
    pageId,
    workspaceId: page.workspace_id,
    updatedAt: page.updated_at,
    words: projected.metrics.words,
    characters: projected.metrics.characters,
  });
  return { kind: "ok" };
}
