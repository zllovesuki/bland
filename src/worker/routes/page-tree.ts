import { Hono } from "hono";
import { eq, and, isNull, asc } from "drizzle-orm";

import type { AppContext } from "@/worker/app-context";
import { pages } from "@/worker/db/d1/schema";
import { optionalAuth } from "@/worker/middleware/auth";
import { rateLimit } from "@/worker/middleware/rate-limit";
import { canAccessPages, resolvePrincipal } from "@/worker/lib/permissions";
import { getPage } from "@/worker/lib/page-access";
import { getPageAncestorChain } from "@/worker/lib/page-tree";

const pageTreeRouter = new Hono<AppContext>();

// GET /workspaces/:wid/pages/:id/children - List children
// Supports both JWT auth (workspace members) and ?share=<token> (shared-link users)
pageTreeRouter.get("/workspaces/:wid/pages/:id/children", optionalAuth, rateLimit("RL_API"), async (c) => {
  const workspaceId = c.req.param("wid");
  const pageId = c.req.param("id");
  const user = c.get("user");
  const db = c.get("db");
  const shareToken = c.req.query("share");

  const resolved = await resolvePrincipal(db, user, workspaceId, {
    surface: shareToken ? "shared" : "canonical",
    shareToken,
  });
  if (!resolved) {
    return c.json({ error: "unauthorized", message: "Authentication required" }, 401);
  }

  // Resolve parent access before loading metadata or children so an inaccessible
  // existing parent returns the same `not_found` as a missing parent (no existence leak).
  const parentAccess = await canAccessPages(db, resolved.principal, [pageId], workspaceId, "view");
  if (!parentAccess.get(pageId)) {
    return c.json({ error: "not_found", message: "Page not found" }, 404);
  }

  const parentPage = await getPage(db, pageId, workspaceId);
  if (!parentPage) return c.json({ error: "not_found", message: "Page not found" }, 404);

  const children = await db
    .select()
    .from(pages)
    .where(and(eq(pages.workspace_id, workspaceId), eq(pages.parent_id, pageId), isNull(pages.archived_at)))
    .orderBy(asc(pages.position));

  if (children.length === 0) {
    return c.json({ pages: [] });
  }

  // `canAccessPages` fast-paths canonical members internally, so the same branch
  // handles members, guests, and shared-link viewers.
  const childAccess = await canAccessPages(
    db,
    resolved.principal,
    children.map((child) => child.id),
    workspaceId,
    "view",
  );
  const visible = children.filter((child) => childAccess.get(child.id));
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

  const resolved = await resolvePrincipal(db, user, workspaceId, {
    surface: shareToken ? "shared" : "canonical",
    shareToken,
  });
  if (!resolved) {
    return c.json({ error: "unauthorized", message: "Authentication required" }, 401);
  }

  // Gate on target page access before returning ancestor chain. `canAccessPages`
  // applies the member fast-path internally for canonical viewers.
  const access = await canAccessPages(db, resolved.principal, [pageId], workspaceId, "view");
  if (!access.get(pageId)) {
    return c.json({ error: "not_found", message: "Page not found" }, 404);
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
