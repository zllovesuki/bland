import { eq, and, isNull } from "drizzle-orm";
import { pages } from "@/worker/db/d1/schema";
import type { Db } from "@/worker/db/d1/client";

/**
 * Look up a non-archived page by id, optionally scoped to a workspace.
 * Returns the page row or null.
 */
export async function getPage(db: Db, pageId: string, workspaceId?: string) {
  const conditions = [eq(pages.id, pageId), isNull(pages.archived_at)];
  if (workspaceId) {
    conditions.push(eq(pages.workspace_id, workspaceId));
  }
  return (
    db
      .select()
      .from(pages)
      .where(and(...conditions))
      .get() ?? null
  );
}
