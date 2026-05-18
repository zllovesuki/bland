import { and, eq, inArray, ne } from "drizzle-orm";

import type { Db } from "@/worker/db/d1/client";
import { pages, workspaceSites } from "@/worker/db/d1/schema";

export function siteRevisionTimestamp(now: Date = new Date()): string {
  return now.toISOString();
}

export async function bumpPublicSiteRevision(
  db: Db,
  workspaceId: string,
  updatedAt = siteRevisionTimestamp(),
): Promise<void> {
  await db.update(workspaceSites).set({ updated_at: updatedAt }).where(eq(workspaceSites.workspace_id, workspaceId));
}

export async function updatePublicSiteSettingsWithRevision(
  db: Db,
  workspaceId: string,
  values: Record<string, unknown>,
  updatedAt = siteRevisionTimestamp(),
): Promise<void> {
  await db
    .update(workspaceSites)
    .set({ ...values, updated_at: updatedAt })
    .where(eq(workspaceSites.workspace_id, workspaceId));
}

/**
 * DocSync stores the document body in its Durable Object. D1 mirrors the title
 * and the page save timestamp used by Sites R2/HTML cache freshness.
 */
export async function recordDocSyncPageSave(
  db: Db,
  pageId: string,
  title: string,
  updatedAt = siteRevisionTimestamp(),
): Promise<void> {
  await db.batch([
    db
      .update(workspaceSites)
      .set({ updated_at: updatedAt })
      .where(
        inArray(
          workspaceSites.workspace_id,
          db
            .select({ workspaceId: pages.workspace_id })
            .from(pages)
            .where(and(eq(pages.id, pageId), ne(pages.title, title))),
        ),
      ),
    db.update(pages).set({ title, updated_at: updatedAt }).where(eq(pages.id, pageId)),
  ]);
}
