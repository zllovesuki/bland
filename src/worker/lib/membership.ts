import { and, eq } from "drizzle-orm";

import { memberships } from "@/worker/db/schema";
import type { Db } from "@/worker/db/client";

export async function checkMembership(
  db: Db,
  userId: string,
  workspaceId: string,
): Promise<typeof memberships.$inferSelect | null> {
  const result = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.user_id, userId), eq(memberships.workspace_id, workspaceId)))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}
