import { Hono } from "hono";
import { eq, and, isNull, inArray } from "drizzle-orm";

import type { AppContext } from "@/worker/app-context";
import { pages, workspaces } from "@/worker/db/d1/schema";
import { optionalAuth } from "@/worker/middleware/auth";
import { rateLimit } from "@/worker/middleware/rate-limit";
import { resolvePageAccessLevels, resolvePrincipal } from "@/worker/lib/permissions";
import { parseBody } from "@/worker/lib/validate";
import { ResolvePageMentionsRequest, type ResolvedPageMentionItem } from "@/shared/types";

const pageMentionsRouter = new Hono<AppContext>();

// POST /workspaces/:wid/page-mentions/resolve
// Resolves a batch of pageIds to mention metadata for the current viewer.
// Missing, archived, cross-workspace, and inaccessible ids all collapse to
// { accessible: false, title: null, icon: null } so the client cannot distinguish.
pageMentionsRouter.post("/workspaces/:wid/page-mentions/resolve", optionalAuth, rateLimit("RL_API"), async (c) => {
  const workspaceId = c.req.param("wid");
  const user = c.get("user");
  const db = c.get("db");
  const shareToken = c.req.query("share");

  const data = await parseBody(c, ResolvePageMentionsRequest);
  if (data instanceof Response) return data;

  const resolved = await resolvePrincipal(db, user, workspaceId, shareToken);
  if (!resolved) {
    return c.json({ error: "unauthorized", message: "Authentication required" }, 401);
  }

  const workspaceExists = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .get();
  if (!workspaceExists) {
    return c.json({ error: "not_found", message: "Workspace not found" }, 404);
  }

  const requestedIds = [...new Set(data.page_ids)];
  const accessLevels = await resolvePageAccessLevels(db, resolved.principal, requestedIds, workspaceId);

  const accessibleIds = requestedIds.filter((id) => (accessLevels.get(id) ?? "none") !== "none");

  const metaById = new Map<string, { title: string; icon: string | null }>();
  if (accessibleIds.length > 0) {
    const rows = await db
      .select({ id: pages.id, title: pages.title, icon: pages.icon })
      .from(pages)
      .where(and(inArray(pages.id, accessibleIds), eq(pages.workspace_id, workspaceId), isNull(pages.archived_at)));
    for (const row of rows) {
      metaById.set(row.id, { title: row.title, icon: row.icon });
    }
  }

  const mentions: ResolvedPageMentionItem[] = requestedIds.map((pageId) => {
    const meta = metaById.get(pageId);
    if (!meta) {
      return { page_id: pageId, accessible: false, title: null, icon: null };
    }
    return { page_id: pageId, accessible: true, title: meta.title, icon: meta.icon };
  });

  return c.json({ mentions });
});

export { pageMentionsRouter };
