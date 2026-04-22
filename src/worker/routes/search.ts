import { Hono } from "hono";
import { inArray } from "drizzle-orm";

import type { AppContext } from "@/worker/app-context";
import { pages } from "@/worker/db/d1/schema";
import { requireAuth } from "@/worker/middleware/auth";
import { rateLimit } from "@/worker/middleware/rate-limit";
import { checkMembership } from "@/worker/lib/membership";
import { canAccessPages } from "@/worker/lib/permissions";
import { sanitizeSnippet } from "@/worker/lib/html";
import { createLogger } from "@/worker/lib/logger";

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
  // Guests and non-members with page-level shares get post-filtered results
  const needsFilter = !membership || membership.role === "guest";

  // Overfetch from WorkspaceIndexer to compensate for post-filtering
  const overfetchLimit = needsFilter ? 100 : 50;

  const indexer = c.env.WorkspaceIndexer.getByName(workspaceId);
  const searchResult = await indexer.search(query, overfetchLimit);

  if (searchResult.items.length === 0) {
    return c.json({ results: [] });
  }

  const pageIds = searchResult.items.map((item) => item.pageId);

  // Load page metadata from D1 (title, icon, archived_at filtering)
  const pageRows = await db
    .select({ id: pages.id, title: pages.title, icon: pages.icon, archived_at: pages.archived_at })
    .from(pages)
    .where(inArray(pages.id, pageIds));

  // Index by page ID and filter archived pages
  const pageById = new Map(pageRows.filter((p) => !p.archived_at).map((p) => [p.id, p]));

  // Reconstruct results preserving DO rank order
  let results = searchResult.items
    .filter((item) => pageById.has(item.pageId))
    .map((item) => {
      const page = pageById.get(item.pageId)!;
      return {
        page_id: item.pageId,
        title: page.title,
        icon: page.icon,
        snippet: sanitizeSnippet(item.snippet),
      };
    });

  // Post-filter by canAccess for guests
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
  } else {
    results = results.slice(0, MAX_RESULTS);
  }

  log.debug("search_executed", { workspaceId, query, resultCount: results.length });

  return c.json({ results });
});
