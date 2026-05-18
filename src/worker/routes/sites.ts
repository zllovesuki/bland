import { Hono, type Context } from "hono";
import { and, eq, isNull, ne } from "drizzle-orm";

import type { AppContext } from "@/worker/app-context";
import { pages, publishedPages, workspaceSites } from "@/worker/db/d1/schema";
import { requireAuth } from "@/worker/middleware/auth";
import { rateLimit } from "@/worker/middleware/rate-limit";
import { checkMembership } from "@/worker/lib/membership";
import { getPage } from "@/worker/lib/page-access";
import { getSitesBaseDomain, isSitesFeatureEnabled, resolvePagePublishStatus } from "@/worker/lib/published-pages";
import { buildSitePublicUrl } from "@/worker/lib/site-public-url";
import {
  bumpPublicSiteRevision,
  updatePublicSiteSettingsWithRevision,
  siteRevisionTimestamp,
} from "@/worker/lib/site-invalidation";
import { deleteSiteR2 } from "@/worker/sites/cache";
import { parseBody } from "@/worker/lib/validate";
import { createLogger } from "@/worker/lib/logger";
import { sitesSlug } from "@/shared/site-slug";
import { WorkspaceSiteUpdateRequest } from "@/shared/types";
import { getSitePublishingEntitlements, type ResolvedWorkspaceRole } from "@/shared/entitlements";

const log = createLogger("sites");

const sitesRouter = new Hono<AppContext>();

sitesRouter.use("*", async (c, next) => {
  if (!isSitesFeatureEnabled(c.env)) {
    return c.json({ error: "sites_disabled", message: "Sites are not enabled on this instance" }, 404);
  }
  await next();
});

async function resolveSitesEntitlements(c: Context<AppContext>) {
  const user = c.get("user")!;
  const db = c.get("db");
  const wid = c.req.param("wid")!;
  const membership = await checkMembership(db, user.id, wid);
  const role: ResolvedWorkspaceRole = membership?.role ?? "none";
  const entitlements = getSitePublishingEntitlements(role);
  return { user, db, wid, role, entitlements } as const;
}

async function requireCanManageSite(c: Context<AppContext>) {
  const access = await resolveSitesEntitlements(c);
  if (!access.entitlements.manageSite) {
    return {
      error: c.json({ error: "forbidden", message: "Only workspace owners and admins can manage Sites" }, 403),
    } as const;
  }
  return access;
}

// GET /workspaces/:wid/site - site management config
sitesRouter.get("/workspaces/:wid/site", requireAuth, rateLimit("RL_API"), async (c) => {
  const guard = await requireCanManageSite(c);
  if ("error" in guard) return guard.error;
  const site = await c.get("db").select().from(workspaceSites).where(eq(workspaceSites.workspace_id, guard.wid)).get();
  return c.json({ site: site ?? null, base_domain: getSitesBaseDomain(c.env) });
});

// PATCH /workspaces/:wid/site - lazy upsert site config
sitesRouter.patch("/workspaces/:wid/site", requireAuth, rateLimit("RL_API"), async (c) => {
  const guard = await requireCanManageSite(c);
  if ("error" in guard) return guard.error;
  const { db, wid } = guard;

  const data = await parseBody(c, WorkspaceSiteUpdateRequest);
  if (data instanceof Response) return data;
  if (Object.keys(data).length === 0) {
    return c.json({ error: "bad_request", message: "No fields to update" }, 400);
  }

  if (data.slug !== undefined) {
    const conflict = await db
      .select({ wid: workspaceSites.workspace_id })
      .from(workspaceSites)
      .where(and(eq(workspaceSites.slug, data.slug), ne(workspaceSites.workspace_id, wid)))
      .get();
    if (conflict) {
      return c.json({ error: "conflict", message: "This slug is already in use" }, 409);
    }
  }

  if (data.home_page_id !== undefined && data.home_page_id !== null) {
    const status = await resolvePagePublishStatus(db, wid, data.home_page_id);
    if (!status.page) {
      return c.json({ error: "bad_request", message: "Home page not found" }, 400);
    }
    if (status.page.archived_at) {
      return c.json({ error: "bad_request", message: "Home page is archived" }, 400);
    }
    if (status.page.kind !== "doc") {
      return c.json({ error: "bad_request", message: "Home page must be a document" }, 400);
    }
    if (!status.is_explicit_root && !status.inherited_from) {
      return c.json({ error: "bad_request", message: "Home page must be published first" }, 400);
    }
  }

  const existing = await db.select().from(workspaceSites).where(eq(workspaceSites.workspace_id, wid)).get();
  const now = siteRevisionTimestamp();

  if (!existing) {
    if (!data.slug) {
      return c.json({ error: "bad_request", message: "Slug is required to create a site" }, 400);
    }
    await db.insert(workspaceSites).values({
      workspace_id: wid,
      slug: data.slug,
      home_page_id: data.home_page_id ?? null,
      published_at: data.published ? now : null,
      created_at: now,
      updated_at: now,
    });
  } else {
    const updates: Record<string, unknown> = {};
    if (data.slug !== undefined) updates.slug = data.slug;
    if (data.home_page_id !== undefined) updates.home_page_id = data.home_page_id;
    if (data.published !== undefined) {
      // Preserve the original published_at when toggling enable->enable to avoid clock churn.
      updates.published_at = data.published ? (existing.published_at ?? now) : null;
    }
    await updatePublicSiteSettingsWithRevision(db, wid, updates, now);
  }

  const fresh = await db.select().from(workspaceSites).where(eq(workspaceSites.workspace_id, wid)).get();
  log.info("site_updated", { wid, fields: Object.keys(data) });
  return c.json({ site: fresh ?? null, base_domain: getSitesBaseDomain(c.env) });
});

// GET /workspaces/:wid/site/slug-availability
sitesRouter.get("/workspaces/:wid/site/slug-availability", requireAuth, rateLimit("RL_API"), async (c) => {
  const guard = await requireCanManageSite(c);
  if ("error" in guard) return guard.error;
  const { db, wid } = guard;

  const slug = c.req.query("slug");
  if (!slug) {
    return c.json({ error: "bad_request", message: "slug query param is required" }, 400);
  }
  const validation = sitesSlug.safeParse(slug);
  if (!validation.success) {
    return c.json({ available: false, reason: validation.error.issues[0]?.message ?? "Invalid slug" });
  }
  const conflict = await db
    .select({ wid: workspaceSites.workspace_id })
    .from(workspaceSites)
    .where(and(eq(workspaceSites.slug, slug), ne(workspaceSites.workspace_id, wid)))
    .get();
  return c.json({ available: !conflict, reason: conflict ? "This slug is already in use" : undefined });
});

// GET /workspaces/:wid/site/pages - list explicit publish roots
sitesRouter.get("/workspaces/:wid/site/pages", requireAuth, rateLimit("RL_API"), async (c) => {
  const guard = await requireCanManageSite(c);
  if ("error" in guard) return guard.error;
  const { db, wid } = guard;

  const rows = await db
    .select({
      workspace_id: publishedPages.workspace_id,
      page_id: publishedPages.page_id,
      published_by: publishedPages.published_by,
      published_at: publishedPages.published_at,
      title: pages.title,
      icon: pages.icon,
      kind: pages.kind,
    })
    .from(publishedPages)
    .innerJoin(pages, eq(publishedPages.page_id, pages.id))
    .where(and(eq(publishedPages.workspace_id, wid), isNull(pages.archived_at)));
  return c.json({ published_roots: rows });
});

// POST /workspaces/:wid/site/pages/:id - mark page as publish root
sitesRouter.post("/workspaces/:wid/site/pages/:id", requireAuth, rateLimit("RL_API"), async (c) => {
  const guard = await requireCanManageSite(c);
  if ("error" in guard) return guard.error;
  const { db, wid, user } = guard;
  const pageId = c.req.param("id");

  const page = await getPage(db, pageId, wid);
  if (!page) {
    return c.json({ error: "not_found", message: "Page not found" }, 404);
  }
  if (page.kind !== "doc") {
    return c.json({ error: "bad_request", message: "Only document pages can be published" }, 400);
  }

  await db
    .insert(publishedPages)
    .values({ workspace_id: wid, page_id: pageId, published_by: user.id })
    .onConflictDoNothing();
  await bumpPublicSiteRevision(db, wid);
  log.info("page_published", { wid, pageId, userId: user.id });
  return c.json({ ok: true });
});

// DELETE /workspaces/:wid/site/pages/:id - remove explicit publish root
sitesRouter.delete("/workspaces/:wid/site/pages/:id", requireAuth, rateLimit("RL_API"), async (c) => {
  const guard = await requireCanManageSite(c);
  if ("error" in guard) return guard.error;
  const { db, wid, user } = guard;
  const pageId = c.req.param("id");

  await db.delete(publishedPages).where(and(eq(publishedPages.workspace_id, wid), eq(publishedPages.page_id, pageId)));
  await bumpPublicSiteRevision(db, wid);
  // Drop the stale R2 object so storage does not accumulate after unpublish.
  // Inherited subpages keep their R2 objects; they will 404 via resolver-first
  // and get rewritten by the freshness check on next publish.
  try {
    await deleteSiteR2(c.env, wid, pageId);
  } catch (e) {
    log.error("site_r2_delete_failed", { wid, pageId, error: e instanceof Error ? e.message : String(e) });
  }
  log.info("page_unpublished", { wid, pageId, userId: user.id });
  return c.json({ ok: true });
});

// GET /workspaces/:wid/site/pages/:id/status - read-only publish status
sitesRouter.get("/workspaces/:wid/site/pages/:id/status", requireAuth, rateLimit("RL_API"), async (c) => {
  const access = await resolveSitesEntitlements(c);
  const { db, wid } = access;
  const pageId = c.req.param("id");

  if (!access.entitlements.viewPagePublishStatus) {
    return c.json({ error: "forbidden", message: "You are not a member of this workspace" }, 403);
  }

  const status = await resolvePagePublishStatus(db, wid, pageId);
  if (!status.page) {
    return c.json({ error: "not_found", message: "Page not found" }, 404);
  }

  const published = status.is_explicit_root || Boolean(status.inherited_from);

  let publicUrl: string | null = null;
  if (published && status.page.kind === "doc") {
    const site = await db
      .select({
        slug: workspaceSites.slug,
        home_page_id: workspaceSites.home_page_id,
        published_at: workspaceSites.published_at,
      })
      .from(workspaceSites)
      .where(eq(workspaceSites.workspace_id, wid))
      .get();
    if (site) {
      publicUrl = buildSitePublicUrl(site, getSitesBaseDomain(c.env), pageId, status.page.title, new URL(c.req.url));
    }
  }

  return c.json({
    published,
    is_explicit_root: status.is_explicit_root,
    inherited_from: status.inherited_from,
    public_url: publicUrl,
    canvas: status.page.kind === "canvas",
  });
});

export { sitesRouter };
