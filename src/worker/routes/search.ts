import { Hono } from "hono";
import { sql } from "drizzle-orm";

import { requireAuth } from "@/worker/middleware/auth";
import { rateLimit } from "@/worker/middleware/rate-limit";
import { requireMembership } from "@/worker/lib/membership";
import { createLogger } from "@/worker/lib/logger";
import type { AppContext } from "@/worker/router";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sanitizeSnippet(raw: string): string {
  // FTS5 snippet() uses <mark> and </mark> as delimiters.
  // Split on those, escape everything else, then reassemble.
  return raw
    .split(/(<mark>|<\/mark>)/g)
    .map((part) => (part === "<mark>" || part === "</mark>" ? part : escapeHtml(part)))
    .join("");
}

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

  const membership = await requireMembership(c, db, user.id, workspaceId, true);
  if (membership instanceof Response) return membership;

  // FTS5 trigram query — joined with pages to scope to workspace + non-archived.
  // Double-quote wrapping escapes FTS5 operators in user input.
  const escaped = '"' + query.replace(/"/g, '""') + '"';
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
     LIMIT ${MAX_RESULTS}`);

  const results = ftsResults.map((r) => ({
    page_id: r.page_id,
    title: r.title,
    icon: r.icon,
    snippet: sanitizeSnippet(r.snippet),
  }));

  log.debug("search_executed", { workspaceId, query, resultCount: results.length });

  return c.json({ results });
});
