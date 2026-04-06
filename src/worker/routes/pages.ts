import { Hono } from "hono";
import { eq, and, isNull, asc } from "drizzle-orm";
import { ulid } from "ulidx";

import { pages } from "@/worker/db/schema";
import type { Db } from "@/worker/db/client";
import { requireAuth } from "@/worker/middleware/auth";
import { rateLimit } from "@/worker/middleware/rate-limit";
import { requireMembership } from "@/worker/lib/membership";
import { canEdit, isAdminOrOwner } from "@/worker/lib/permissions";
import { parseBody } from "@/worker/lib/validate";
import { createLogger } from "@/worker/lib/logger";
import { DEFAULT_PAGE_TITLE } from "@/worker/lib/constants";
import { CreatePageRequest, UpdatePageRequest } from "@/shared/types";
import type { AppContext } from "@/worker/router";

const log = createLogger("pages");
const MAX_DEPTH = 10;

/**
 * Walk ancestors of a page to compute its depth and check for cycles.
 * Returns the depth (0-based from root) or null if a cycle is detected.
 */
async function getAncestorDepth(db: Db, pageId: string, workspaceId: string): Promise<number | null> {
  let currentId: string | null = pageId;
  const visited = new Set<string>();
  let depth = 0;

  while (currentId) {
    if (visited.has(currentId)) return null; // cycle detected
    if (depth > MAX_DEPTH) return null; // too deep
    visited.add(currentId);

    const result = await db
      .select({ parent_id: pages.parent_id })
      .from(pages)
      .where(and(eq(pages.id, currentId), eq(pages.workspace_id, workspaceId)))
      .get();

    if (!result) break;
    currentId = result.parent_id;
    if (currentId) depth++;
  }

  return depth;
}

/**
 * Check the depth from a given parent down to its deepest descendant,
 * to ensure adding a child would not exceed MAX_DEPTH.
 */
async function getSubtreeMaxDepth(db: Db, parentId: string, workspaceId: string): Promise<number> {
  // BFS to find max depth under parentId
  let depth = 0;
  let currentLevel = [parentId];

  while (currentLevel.length > 0 && depth <= MAX_DEPTH) {
    const nextLevel: string[] = [];
    for (const pid of currentLevel) {
      const children = await db
        .select({ id: pages.id })
        .from(pages)
        .where(and(eq(pages.parent_id, pid), eq(pages.workspace_id, workspaceId), isNull(pages.archived_at)));
      for (const child of children) {
        nextLevel.push(child.id);
      }
    }
    if (nextLevel.length > 0) depth++;
    currentLevel = nextLevel;
  }

  return depth;
}

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
    const parentPage = await db
      .select({ id: pages.id })
      .from(pages)
      .where(and(eq(pages.id, parent_id), eq(pages.workspace_id, workspaceId), isNull(pages.archived_at)))
      .get();

    if (!parentPage) {
      return c.json({ error: "not_found", message: "Parent page not found" }, 404);
    }

    // Check that parent's depth from root + 1 doesn't exceed max
    const parentDepth = await getAncestorDepth(db, parent_id, workspaceId);
    if (parentDepth === null || parentDepth + 1 >= MAX_DEPTH) {
      return c.json({ error: "bad_request", message: `Maximum nesting depth of ${MAX_DEPTH} exceeded` }, 400);
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

  const membership = await requireMembership(c, db, user.id, workspaceId, true);
  if (membership instanceof Response) return membership;

  const result = await db
    .select()
    .from(pages)
    .where(and(eq(pages.workspace_id, workspaceId), isNull(pages.archived_at)))
    .orderBy(asc(pages.position));

  return c.json({ pages: result });
});

// GET /workspaces/:wid/pages/:id - Get page metadata
pagesRouter.get("/workspaces/:wid/pages/:id", requireAuth, rateLimit("RL_API"), async (c) => {
  const workspaceId = c.req.param("wid");
  const pageId = c.req.param("id");
  const user = c.get("user")!;
  const db = c.get("db");

  const membership = await requireMembership(c, db, user.id, workspaceId, true);
  if (membership instanceof Response) return membership;

  const page = await db
    .select()
    .from(pages)
    .where(and(eq(pages.id, pageId), eq(pages.workspace_id, workspaceId), isNull(pages.archived_at)))
    .get();

  if (!page) {
    return c.json({ error: "not_found", message: "Page not found" }, 404);
  }

  return c.json({ page });
});

// GET /workspaces/:wid/pages/:id/children - List children
pagesRouter.get("/workspaces/:wid/pages/:id/children", requireAuth, rateLimit("RL_API"), async (c) => {
  const workspaceId = c.req.param("wid");
  const pageId = c.req.param("id");
  const user = c.get("user")!;
  const db = c.get("db");

  const membership = await requireMembership(c, db, user.id, workspaceId, true);
  if (membership instanceof Response) return membership;

  // Verify parent page exists
  const parentPage = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.id, pageId), eq(pages.workspace_id, workspaceId), isNull(pages.archived_at)))
    .get();

  if (!parentPage) {
    return c.json({ error: "not_found", message: "Page not found" }, 404);
  }

  const children = await db
    .select()
    .from(pages)
    .where(and(eq(pages.workspace_id, workspaceId), eq(pages.parent_id, pageId), isNull(pages.archived_at)))
    .orderBy(asc(pages.position));

  return c.json({ pages: children });
});

// PATCH /workspaces/:wid/pages/:id - Update page
pagesRouter.patch("/workspaces/:wid/pages/:id", requireAuth, rateLimit("RL_API"), async (c) => {
  const workspaceId = c.req.param("wid");
  const pageId = c.req.param("id");
  const user = c.get("user")!;
  const db = c.get("db");

  const membership = await requireMembership(c, db, user.id, workspaceId, true);
  if (membership instanceof Response) return membership;
  if (!canEdit(membership.role)) {
    return c.json({ error: "forbidden", message: "You do not have permission to edit pages in this workspace" }, 403);
  }

  const data = await parseBody(c, UpdatePageRequest);
  if (data instanceof Response) return data;

  // Verify page exists
  const existing = await db
    .select()
    .from(pages)
    .where(and(eq(pages.id, pageId), eq(pages.workspace_id, workspaceId), isNull(pages.archived_at)))
    .get();

  if (!existing) {
    return c.json({ error: "not_found", message: "Page not found" }, 404);
  }

  const updates = data;

  // Handle parent_id change (move operation)
  if (updates.parent_id !== undefined && updates.parent_id !== existing.parent_id) {
    const newParentId = updates.parent_id;

    if (newParentId !== null) {
      // Cannot move a page under itself
      if (newParentId === pageId) {
        return c.json({ error: "bad_request", message: "A page cannot be its own parent" }, 400);
      }

      // Verify new parent exists
      const newParent = await db
        .select({ id: pages.id })
        .from(pages)
        .where(and(eq(pages.id, newParentId), eq(pages.workspace_id, workspaceId), isNull(pages.archived_at)))
        .get();

      if (!newParent) {
        return c.json({ error: "not_found", message: "New parent page not found" }, 404);
      }

      // Cycle prevention: walk ancestors of newParentId to ensure pageId is not among them
      let currentId: string | null = newParentId;
      let walkCount = 0;
      while (currentId && walkCount < MAX_DEPTH) {
        if (currentId === pageId) {
          return c.json({ error: "bad_request", message: "Moving this page would create a cycle" }, 400);
        }
        const ancestor = await db
          .select({ parent_id: pages.parent_id })
          .from(pages)
          .where(and(eq(pages.id, currentId), eq(pages.workspace_id, workspaceId)))
          .get();
        currentId = ancestor?.parent_id ?? null;
        walkCount++;
      }

      // Check depth constraint: depth of newParent from root + subtree depth of moving page + 1
      const parentDepth = await getAncestorDepth(db, newParentId, workspaceId);
      const subtreeDepth = await getSubtreeMaxDepth(db, pageId, workspaceId);

      if (parentDepth === null || parentDepth + 1 + subtreeDepth >= MAX_DEPTH) {
        return c.json(
          { error: "bad_request", message: `Moving this page would exceed the maximum nesting depth of ${MAX_DEPTH}` },
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

  // Verify page exists
  const existing = await db
    .select()
    .from(pages)
    .where(and(eq(pages.id, pageId), eq(pages.workspace_id, workspaceId), isNull(pages.archived_at)))
    .get();

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
