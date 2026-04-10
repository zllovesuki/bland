import { Hono } from "hono";
import { eq, and, isNull, asc } from "drizzle-orm";
import { ulid } from "ulidx";

import { pages } from "@/worker/db/d1/schema";
import { requireAuth, optionalAuth } from "@/worker/middleware/auth";
import { rateLimit } from "@/worker/middleware/rate-limit";
import { checkMembership, requireMembership } from "@/worker/lib/membership";
import {
  canEdit,
  isAdminOrOwner,
  canAccessPage,
  canAccessPages,
  resolvePageAccessLevels,
  resolvePrincipal,
} from "@/worker/lib/permissions";
import { parseBody } from "@/worker/lib/validate";
import { createLogger } from "@/worker/lib/logger";
import { DEFAULT_PAGE_TITLE } from "@/worker/lib/constants";
import { MAX_TREE_DEPTH } from "@/shared/constants";
import { getPage } from "@/worker/lib/page-access";
import { getPageAncestorChain, getPageAncestorDepthFromChain, validatePageMove } from "@/worker/lib/page-tree";
import { CreatePageRequest, UpdatePageRequest } from "@/shared/types";
import type { AppContext } from "@/worker/router";

const log = createLogger("pages");

const pagesRouter = new Hono<AppContext>();

// POST /workspaces/:wid/pages - Create page
pagesRouter.post("/workspaces/:wid/pages", requireAuth, rateLimit("RL_API"), async (c) => {
  const workspaceId = c.req.param("wid");
  const user = c.get("user")!;
  const db = c.get("db");

  const membership = await requireMembership(c, db, user.id, workspaceId, true);
  if (membership instanceof Response) return membership;
  if (!canEdit(membership.role)) {
    return c.json({ error: "forbidden", message: "You do not have permission to create pages in this workspace" }, 403);
  }

  const data = await parseBody(c, CreatePageRequest);
  if (data instanceof Response) return data;

  const { title, icon, parent_id, position } = data;

  // If parent_id specified, validate parent exists and check depth
  if (parent_id) {
    const parentPage = await getPage(db, parent_id, workspaceId);
    if (!parentPage) {
      return c.json({ error: "not_found", message: "Parent page not found" }, 404);
    }

    // Check that parent's depth from root + 1 doesn't exceed max
    const parentDepth = getPageAncestorDepthFromChain(await getPageAncestorChain(db, parent_id, workspaceId));
    if (parentDepth === null || parentDepth + 1 >= MAX_TREE_DEPTH) {
      return c.json({ error: "bad_request", message: `Maximum nesting depth of ${MAX_TREE_DEPTH} exceeded` }, 400);
    }
  }

  // Determine position: use provided or compute next
  let pagePosition = position ?? 0;
  if (position === undefined) {
    // Get the max position among siblings
    const siblings = await db
      .select({ position: pages.position })
      .from(pages)
      .where(
        and(
          eq(pages.workspace_id, workspaceId),
          parent_id ? eq(pages.parent_id, parent_id) : isNull(pages.parent_id),
          isNull(pages.archived_at),
        ),
      )
      .orderBy(asc(pages.position));

    if (siblings.length > 0) {
      pagePosition = siblings[siblings.length - 1].position + 1;
    }
  }

  const pageId = ulid();

  await db.insert(pages).values({
    id: pageId,
    workspace_id: workspaceId,
    parent_id: parent_id ?? null,
    title: title ?? DEFAULT_PAGE_TITLE,
    icon: icon ?? null,
    position: pagePosition,
    created_by: user.id,
  });

  log.info("page_created", { pageId, workspaceId, parentId: parent_id ?? null, userId: user.id });

  // Index newly created page in FTS
  try {
    await c.env.SEARCH_QUEUE.send({ type: "index-page", pageId });
  } catch {
    // Non-critical: FTS is a derived projection
  }

  const now = new Date().toISOString();

  return c.json(
    {
      page: {
        id: pageId,
        workspace_id: workspaceId,
        parent_id: parent_id ?? null,
        title: title ?? DEFAULT_PAGE_TITLE,
        icon: icon ?? null,
        cover_url: null,
        position: pagePosition,
        created_by: user.id,
        created_at: now,
        updated_at: now,
        archived_at: null,
      },
    },
    201,
  );
});

// GET /workspaces/:wid/pages - List all workspace pages (sidebar tree)
pagesRouter.get("/workspaces/:wid/pages", requireAuth, rateLimit("RL_API"), async (c) => {
  const workspaceId = c.req.param("wid");
  const user = c.get("user")!;
  const db = c.get("db");

  const membership = await checkMembership(db, user.id, workspaceId);

  const allPages = await db
    .select()
    .from(pages)
    .where(and(eq(pages.workspace_id, workspaceId), isNull(pages.archived_at)))
    .orderBy(asc(pages.position));

  // Guests and non-members only see pages they have share access to (spec §20.2)
  if (!membership || membership.role === "guest") {
    const principal = { type: "user" as const, userId: user.id };
    const accessByPage = await canAccessPages(
      db,
      principal,
      allPages.map((page) => page.id),
      workspaceId,
      "view",
    );
    const visible = allPages.filter((page) => accessByPage.get(page.id));
    // Reparent pages whose parent is not in the visible set so they appear as roots
    const visibleIds = new Set(visible.map((p) => p.id));
    const reparented = visible.map((p) =>
      p.parent_id && !visibleIds.has(p.parent_id) ? { ...p, parent_id: null } : p,
    );
    return c.json({ pages: reparented });
  }

  return c.json({ pages: allPages });
});

// GET /workspaces/:wid/pages/:id - Get page metadata
// Supports both JWT auth (workspace members) and ?share=<token> (shared-link users)
pagesRouter.get("/workspaces/:wid/pages/:id", optionalAuth, rateLimit("RL_API"), async (c) => {
  const workspaceId = c.req.param("wid");
  const pageId = c.req.param("id");
  const user = c.get("user");
  const db = c.get("db");
  const shareToken = c.req.query("share");

  const resolved = await resolvePrincipal(db, user, workspaceId, shareToken);
  if (!resolved) {
    return c.json({ error: "unauthorized", message: "Authentication required" }, 401);
  }

  // Full workspace members: look up page directly
  if (resolved.fullMember) {
    const page = await getPage(db, pageId, workspaceId);
    if (!page) {
      return c.json({ error: "not_found", message: "Page not found" }, 404);
    }
    return c.json({ page, can_edit: true });
  }

  // Non-members / share-link callers: resolve access first to avoid leaking page existence
  const accessLevels = await resolvePageAccessLevels(db, resolved.principal, [pageId], workspaceId);
  const accessLevel = accessLevels.get(pageId) ?? "none";

  if (accessLevel === "none") {
    return c.json({ error: "not_found", message: "Page not found" }, 404);
  }

  const page = await getPage(db, pageId, workspaceId);
  if (!page) {
    return c.json({ error: "not_found", message: "Page not found" }, 404);
  }

  return c.json({ page, can_edit: accessLevel === "edit" });
});

// PATCH /workspaces/:wid/pages/:id - Update page
pagesRouter.patch("/workspaces/:wid/pages/:id", requireAuth, rateLimit("RL_API"), async (c) => {
  const workspaceId = c.req.param("wid");
  const pageId = c.req.param("id");
  const user = c.get("user")!;
  const db = c.get("db");

  // Verify page exists before permission checks to avoid leaking existence info
  const existing = await getPage(db, pageId, workspaceId);
  if (!existing) {
    return c.json({ error: "not_found", message: "Page not found" }, 404);
  }

  const membership = await checkMembership(db, user.id, workspaceId);

  if (membership && canEdit(membership.role)) {
    // Full edit access for owner/admin/member
  } else {
    // Guest or non-member: check page-level edit share
    const hasEdit = await canAccessPage(db, { type: "user", userId: user.id }, pageId, workspaceId, "edit");
    if (!hasEdit) {
      return c.json({ error: "forbidden", message: "You do not have edit access to this page" }, 403);
    }
  }

  const data = await parseBody(c, UpdatePageRequest);
  if (data instanceof Response) return data;

  // Non-members can only update icon and cover_url, not tree operations
  if (!membership && (data.parent_id !== undefined || data.position !== undefined)) {
    return c.json({ error: "forbidden", message: "Shared users cannot move pages" }, 403);
  }

  const updates = data;

  // Handle parent_id change (move operation)
  if (updates.parent_id !== undefined && updates.parent_id !== existing.parent_id) {
    const newParentId = updates.parent_id;

    if (newParentId !== null) {
      // Verify new parent exists
      const newParent = await getPage(db, newParentId, workspaceId);
      if (!newParent) {
        return c.json({ error: "not_found", message: "New parent page not found" }, 404);
      }

      const moveValidation = await validatePageMove(db, pageId, newParentId, workspaceId);
      if (!moveValidation.ok) {
        if (moveValidation.reason === "self_parent") {
          return c.json({ error: "bad_request", message: "A page cannot be its own parent" }, 400);
        }
        if (moveValidation.reason === "cycle") {
          return c.json({ error: "bad_request", message: "Moving this page would create a cycle" }, 400);
        }
        return c.json(
          {
            error: "bad_request",
            message: `Moving this page would exceed the maximum nesting depth of ${MAX_TREE_DEPTH}`,
          },
          400,
        );
      }
    }
  }

  const updateValues: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.icon !== undefined) updateValues.icon = updates.icon;
  if (updates.cover_url !== undefined) {
    // Only allow null, gradient strings, or local upload paths
    if (
      updates.cover_url !== null &&
      !updates.cover_url.startsWith("linear-gradient(") &&
      !updates.cover_url.startsWith("/uploads/")
    ) {
      return c.json({ error: "bad_request", message: "Cover must be a gradient or an uploaded image" }, 400);
    }
    updateValues.cover_url = updates.cover_url;
  }
  if (updates.position !== undefined) updateValues.position = updates.position;
  if (updates.parent_id !== undefined) updateValues.parent_id = updates.parent_id;

  if (updates.parent_id !== undefined && updates.parent_id !== existing.parent_id) {
    log.info("page_moved", { pageId, workspaceId, from: existing.parent_id, to: updates.parent_id });
  }

  await db.update(pages).set(updateValues).where(eq(pages.id, pageId));
  log.debug("page_updated", { pageId, workspaceId, fields: Object.keys(updateValues) });

  const updated = await db.select().from(pages).where(eq(pages.id, pageId)).get();

  if (!updated) {
    return c.json({ error: "not_found", message: "Page not found" }, 404);
  }

  return c.json({ page: updated });
});

// DELETE /workspaces/:wid/pages/:id - Archive page
pagesRouter.delete("/workspaces/:wid/pages/:id", requireAuth, rateLimit("RL_API"), async (c) => {
  const workspaceId = c.req.param("wid");
  const pageId = c.req.param("id");
  const user = c.get("user")!;
  const db = c.get("db");

  const membership = await requireMembership(c, db, user.id, workspaceId, true);
  if (membership instanceof Response) return membership;

  const existing = await getPage(db, pageId, workspaceId);
  if (!existing) {
    return c.json({ error: "not_found", message: "Page not found" }, 404);
  }

  // Check permission: page creator, admin, or owner
  const isCreator = existing.created_by === user.id;

  if (!isCreator && !isAdminOrOwner(membership.role)) {
    return c.json({ error: "forbidden", message: "Only the page creator or workspace admins can delete pages" }, 403);
  }

  const now = new Date().toISOString();

  // Archive page and orphan children (set their parent_id to NULL)
  await db.batch([
    db.update(pages).set({ archived_at: now, updated_at: now }).where(eq(pages.id, pageId)),
    db
      .update(pages)
      .set({ parent_id: null, updated_at: now })
      .where(and(eq(pages.parent_id, pageId), eq(pages.workspace_id, workspaceId))),
  ]);
  log.info("page_archived", { pageId, workspaceId, userId: user.id });

  // Remove from search index (consumer handles archived pages)
  try {
    await c.env.SEARCH_QUEUE.send({ type: "index-page", pageId });
  } catch {
    // Non-critical: FTS is a derived projection
  }

  return c.json({ ok: true });
});

export { pagesRouter };
