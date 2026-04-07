import { Hono } from "hono";
import { eq, and, isNull, asc } from "drizzle-orm";

import { pages } from "@/worker/db/schema";
import { optionalAuth } from "@/worker/middleware/auth";
import { rateLimit } from "@/worker/middleware/rate-limit";
import { canAccessPages, resolvePrincipal } from "@/worker/lib/permissions";
import { getPage } from "@/worker/lib/page-access";
import { getPageAncestorChain } from "@/worker/lib/page-tree";
import type { AppContext } from "@/worker/router";

const pageTreeRouter = new Hono<AppContext>();

// GET /workspaces/:wid/pages/:id/children - List children
// Supports both JWT auth (workspace members) and ?share=<token> (shared-link users)
pageTreeRouter.get("/workspaces/:wid/pages/:id/children", optionalAuth, rateLimit("RL_API"), async (c) => {
  const workspaceId = c.req.param("wid");
  const pageId = c.req.param("id");
  const user = c.get("user");
  const db = c.get("db");
  const shareToken = c.req.query("share");

  const resolved = await resolvePrincipal(db, user, workspaceId, shareToken);
  if (!resolved) {
    return c.json({ error: "unauthorized", message: "Authentication required" }, 401);
  }

  const parentPage = await getPage(db, pageId, workspaceId);
  if (!parentPage) return c.json({ error: "not_found", message: "Page not found" }, 404);

  const children = await db
    .select()
    .from(pages)
    .where(and(eq(pages.workspace_id, workspaceId), eq(pages.parent_id, pageId), isNull(pages.archived_at)))
    .orderBy(asc(pages.position));

  // Full workspace member — return all children directly (no per-page permission check needed)
  if (resolved.fullMember) {
    return c.json({ pages: children });
  }

  const accessByPage = await canAccessPages(
    db,
    resolved.principal,
    [pageId, ...children.map((child) => child.id)],
    workspaceId,
    "view",
  );
  if (!accessByPage.get(pageId)) {
    return c.json({ error: "forbidden", message: "You do not have access to this page" }, 403);
  }
  const visible = children.filter((child) => accessByPage.get(child.id));
  return c.json({ pages: visible });
});

// GET /workspaces/:wid/pages/:id/ancestors - Ancestor chain with access info
// Returns root-first array. Inaccessible ancestors have null title/icon (no title leak). §20.2
pageTreeRouter.get("/workspaces/:wid/pages/:id/ancestors", optionalAuth, rateLimit("RL_API"), async (c) => {
  const workspaceId = c.req.param("wid");
  const pageId = c.req.param("id");
  const user = c.get("user");
  const db = c.get("db");
  const shareToken = c.req.query("share");

  const resolved = await resolvePrincipal(db, user, workspaceId, shareToken);
  if (!resolved) {
    return c.json({ error: "unauthorized", message: "Authentication required" }, 401);
  }

  // Gate on target page access before returning ancestor chain
  if (resolved.fullMember) {
    const page = await getPage(db, pageId, workspaceId);
    if (!page) return c.json({ error: "not_found", message: "Page not found" }, 404);
  } else {
    const access = await canAccessPages(db, resolved.principal, [pageId], workspaceId, "view");
    if (!access.get(pageId)) {
      return c.json({ error: "not_found", message: "Page not found" }, 404);
    }
  }

  const chain = await getPageAncestorChain(db, pageId, workspaceId);
  // chain is [page, parent, grandparent, ...] — remove self (first element), then reverse to root-first
  chain.shift();
  chain.reverse();

  const ancestorAccess = await canAccessPages(
    db,
    resolved.principal,
    chain.map((ancestor) => ancestor.id),
    workspaceId,
    "view",
  );
  const ancestors = chain.map((a) => {
    const accessible = ancestorAccess.get(a.id) ?? false;
    return {
      id: a.id,
      title: accessible ? a.title : null,
      icon: accessible ? a.icon : null,
      accessible,
    };
  });

  return c.json({ ancestors });
});

export { pageTreeRouter };
