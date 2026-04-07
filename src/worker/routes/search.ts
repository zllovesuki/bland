import { Hono } from "hono";
import { sql } from "drizzle-orm";

import { requireAuth } from "@/worker/middleware/auth";
import { rateLimit } from "@/worker/middleware/rate-limit";
import { checkMembership } from "@/worker/lib/membership";
import { canAccessPages } from "@/worker/lib/permissions";
import { sanitizeSnippet } from "@/worker/lib/html";
import { createLogger } from "@/worker/lib/logger";
import type { AppContext } from "@/worker/router";

const log = createLogger("search");

const MAX_RESULTS = 20;

export const searchRouter = new Hono<AppContext>();

// GET /workspaces/:wid/search?q=... - Full-text search
searchRouter.get("/workspaces/:wid/search", requireAuth, rateLimit("RL_API"), async (c) => {
  const workspaceId = c.req.param("wid");
  const user = c.get("user")!;
  const db = c.get("db");
  const query = c.req.query("q")?.trim();

  if (!query || query.length < 3) {
    return c.json({ results: [] });
  }

  const membership = await checkMembership(db, user.id, workspaceId);
  const needsFilter = !membership || membership.role === "guest";

  // FTS5 trigram query — joined with pages to scope to workspace + non-archived.
  // Double-quote wrapping escapes FTS5 operators in user input.
  // Guests need post-filtering by canAccess, so fetch more to compensate.
  const escaped = '"' + query.replace(/"/g, '""') + '"';
  const ftsLimit = needsFilter ? 50 : MAX_RESULTS;
  const ftsResults = await db.all<{
    page_id: string;
    title: string;
    icon: string | null;
    snippet: string;
  }>(sql`SELECT f.page_id, p.title, p.icon,
            snippet(pages_fts, 2, '<mark>', '</mark>', '…', 32) as snippet
     FROM pages_fts f
     JOIN pages p ON p.id = f.page_id
     WHERE pages_fts MATCH ${escaped}
       AND p.workspace_id = ${workspaceId}
       AND p.archived_at IS NULL
     LIMIT ${ftsLimit}`);

  let results = ftsResults.map((r) => ({
    page_id: r.page_id,
    title: r.title,
    icon: r.icon,
    snippet: sanitizeSnippet(r.snippet),
  }));

  // §20.2: post-filter by canAccess for guests and non-members
  if (needsFilter) {
    const accessByPage = await canAccessPages(
      db,
      { type: "user", userId: user.id },
      results.map((result) => result.page_id),
      workspaceId,
      "view",
    );
    const filtered = [];
    for (const r of results) {
      if (accessByPage.get(r.page_id)) {
        filtered.push(r);
        if (filtered.length >= MAX_RESULTS) break;
      }
    }
    results = filtered;
  }

  log.debug("search_executed", { workspaceId, query, resultCount: results.length });

  return c.json({ results });
});
