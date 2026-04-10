import { and, eq } from "drizzle-orm";
import type { Context } from "hono";

import { memberships } from "@/worker/db/d1/schema";
import type { Db } from "@/worker/db/d1/client";

export async function checkMembership(
  db: Db,
  userId: string,
  workspaceId: string,
): Promise<typeof memberships.$inferSelect | null> {
  const result = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.user_id, userId), eq(memberships.workspace_id, workspaceId)))
    .get();
  return result ?? null;
}

/**
 * Check membership and return it, or send a 403 response.
 * Optionally rejects guests when `rejectGuest` is true.
 */
export async function requireMembership(
  c: Context,
  db: Db,
  userId: string,
  workspaceId: string,
  rejectGuest?: boolean,
): Promise<typeof memberships.$inferSelect | Response> {
  const membership = await checkMembership(db, userId, workspaceId);
  if (!membership) {
    return c.json({ error: "forbidden", message: "You are not a member of this workspace" }, 403);
  }
  if (rejectGuest && membership.role === "guest") {
    return c.json({ error: "forbidden", message: "Guests cannot access this resource" }, 403);
  }
  return membership;
}
