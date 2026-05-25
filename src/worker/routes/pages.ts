import { Hono } from "hono";
import { eq, and, isNull, asc } from "drizzle-orm";
import { ulid } from "ulid";

import type { AppContext } from "@/worker/app-context";
import { pages } from "@/worker/db/d1/schema";
import { requireAuth, optionalAuth } from "@/worker/middleware/auth";
import { rateLimit } from "@/worker/middleware/rate-limit";
import { checkMembership, requireMembership } from "@/worker/lib/membership";
import {
  canEdit,
  canAccessPage,
  canAccessPages,
  resolvePageAccessLevels,
  resolvePrincipal,
} from "@/worker/lib/permissions";
import { parseBody } from "@/worker/lib/validate";
import { createLogger } from "@/worker/lib/logger";
import { bumpPublicSiteRevision } from "@/worker/lib/site-invalidation";
import { DEFAULT_PAGE_TITLE } from "@/worker/lib/constants";
import { MAX_TREE_DEPTH } from "@/shared/constants";
import {
  getPageEditEntitlements,
  getPageStructureEntitlements,
  type PageAccessLevel,
  type ResolvedWorkspaceRole,
} from "@/shared/entitlements";
import { getPage } from "@/worker/lib/page-access";
import {
  archivePageSubtree,
  getArchivedAncestorRows,
  getArchivedPageRootRows,
  getPageAncestorChain,
  getPageAncestorDepthFromChain,
  getPageSubtreeRows,
  restorePageSubtree,
  validatePageMove,
  type PageSubtreeRow,
} from "@/worker/lib/page-tree";
import type { TasksQueueMessage } from "@/worker/queues/messages";
import { CreatePageRequest, UpdatePageRequest, type Page } from "@/shared/types";
import { isGradientPreset, parseUploadCoverUrl } from "@/shared/page-cover";

const log = createLogger("pages");
const INDEX_QUEUE_BATCH_SIZE = 100;

const pagesRouter = new Hono<AppContext>();

// POST /workspaces/:wid/pages - Create page
pagesRouter.post("/workspaces/:wid/pages", requireAuth, rateLimit("RL_API"), async (c) => {
  const workspaceId = c.req.param("wid");
  const user = c.get("user")!;
  const db = c.get("db");

  const membership = await requireMembership(c, db, user.id, workspaceId, true);
  if (membership instanceof Response) return membership;
  if (!getPageStructureEntitlements(membership.role, false).createPage) {
    return c.json({ error: "forbidden", message: "You do not have permission to create pages in this workspace" }, 403);
  }

  const data = await parseBody(c, CreatePageRequest);
  if (data instanceof Response) return data;

  const { kind, title, icon, parent_id, position } = data;

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
    kind,
    title: title ?? DEFAULT_PAGE_TITLE,
    icon: icon ?? null,
    position: pagePosition,
    created_by: user.id,
  });

  log.info("page_created", { pageId, workspaceId, kind, parentId: parent_id ?? null, userId: user.id });

  // Index and project newly created pages through derived background tasks.
  try {
    const messages: TasksQueueMessage[] = [{ type: "index-page", pageId }];
    if (kind === "doc") messages.push({ type: "page-projection", pageId });
    await c.env.TASKS_QUEUE.sendBatch(messages.map((body) => ({ body })));
  } catch {
    // Non-critical: FTS and Sites JSON are derived projections.
  }

  const now = new Date().toISOString();

  return c.json(
    {
      page: {
        id: pageId,
        workspace_id: workspaceId,
        parent_id: parent_id ?? null,
        kind,
        title: title ?? DEFAULT_PAGE_TITLE,
        icon: icon ?? null,
        cover_url: null,
        position: pagePosition,
        created_by: user.id,
        created_at: now,
        updated_at: now,
        archived_at: null,
        archive_root_id: null,
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

// GET /workspaces/:wid/pages/archived - List archive roots for trash management
pagesRouter.get("/workspaces/:wid/pages/archived", requireAuth, rateLimit("RL_API"), async (c) => {
  const workspaceId = c.req.param("wid");
  const user = c.get("user")!;
  const db = c.get("db");

  const membership = await requireMembership(c, db, user.id, workspaceId, true);
  if (membership instanceof Response) return membership;

  const canListAllArchivedPages = membership.role === "owner" || membership.role === "admin";
  const archivedPages = await getArchivedPageRootRows(
    db,
    workspaceId,
    canListAllArchivedPages ? {} : { createdBy: user.id },
  );

  return c.json({ pages: archivedPages });
});

// GET /workspaces/:wid/pages/:id - Get page metadata
// Supports both JWT auth (workspace members) and ?share=<token> (shared-link users)
pagesRouter.get("/workspaces/:wid/pages/:id", optionalAuth, rateLimit("RL_API"), async (c) => {
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

  // Resolve access first to avoid leaking page existence. `resolvePageAccessLevels`
  // fast-paths canonical members internally, so we do not branch on that here.
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

// GET /workspaces/:wid/pages/:id/snapshot - Bootstrap persisted Yjs snapshot
// Supports both JWT auth (workspace members) and ?share=<token> (shared-link users)
pagesRouter.get("/workspaces/:wid/pages/:id/snapshot", optionalAuth, rateLimit("RL_API"), async (c) => {
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

  const accessLevels = await resolvePageAccessLevels(db, resolved.principal, [pageId], workspaceId);
  if ((accessLevels.get(pageId) ?? "none") === "none") {
    return c.json({ error: "not_found", message: "Page not found" }, 404);
  }

  const page = await getPage(db, pageId, workspaceId);
  if (!page) {
    return c.json({ error: "not_found", message: "Page not found" }, 404);
  }

  const doc = c.env.DocSync.getByName(pageId);
  const snapshot = await doc.getSnapshotResponse(pageId);
  if (snapshot.kind === "missing") {
    return new Response(null, { status: 204 });
  }

  return snapshot.response;
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
  const workspaceRole: ResolvedWorkspaceRole = membership?.role ?? "none";
  let pageAccess: PageAccessLevel;

  if (membership && canEdit(membership.role)) {
    pageAccess = "edit";
  } else {
    const hasEdit = await canAccessPage(db, { type: "user", userId: user.id }, pageId, workspaceId, "edit");
    if (!hasEdit) {
      return c.json({ error: "forbidden", message: "You do not have edit access to this page" }, 403);
    }
    pageAccess = "edit";
  }

  const data = await parseBody(c, UpdatePageRequest);
  if (data instanceof Response) return data;
  const editEntitlements = getPageEditEntitlements("canonical", pageAccess);
  const structureEntitlements = getPageStructureEntitlements(workspaceRole, existing.created_by === user.id);

  if (!editEntitlements.editPageMetadata) {
    return c.json({ error: "forbidden", message: "You do not have edit access to this page" }, 403);
  }

  if ((data.parent_id !== undefined || data.position !== undefined) && !structureEntitlements.movePage) {
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

  const updatedAt = new Date().toISOString();
  const updateValues: Record<string, unknown> = {
    updated_at: updatedAt,
  };

  if (updates.icon !== undefined) updateValues.icon = updates.icon;
  if (updates.cover_url !== undefined) {
    if (!isAllowedPageCoverUrl(updates.cover_url)) {
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
  if (
    updates.icon !== undefined ||
    updates.cover_url !== undefined ||
    (updates.parent_id !== undefined && updates.parent_id !== existing.parent_id)
  ) {
    await bumpPublicSiteRevision(db, workspaceId, updatedAt);
  }
  if (updates.cover_url !== undefined && updates.cover_url !== null) {
    await enqueueSiteCover(c.env, pageId);
  }
  log.debug("page_updated", { pageId, workspaceId, fields: Object.keys(updateValues) });

  const updated = await db.select().from(pages).where(eq(pages.id, pageId)).get();

  if (!updated) {
    return c.json({ error: "not_found", message: "Page not found" }, 404);
  }

  return c.json({ page: updated });
});

// POST /workspaces/:wid/pages/:id/restore - Restore an archived page operation
pagesRouter.post("/workspaces/:wid/pages/:id/restore", requireAuth, rateLimit("RL_API"), async (c) => {
  const workspaceId = c.req.param("wid");
  const pageId = c.req.param("id");
  const user = c.get("user")!;
  const db = c.get("db");

  const membership = await requireMembership(c, db, user.id, workspaceId, true);
  if (membership instanceof Response) return membership;

  const existing = await db
    .select()
    .from(pages)
    .where(and(eq(pages.id, pageId), eq(pages.workspace_id, workspaceId)))
    .get();
  if (!existing) {
    return c.json({ error: "not_found", message: "Page not found" }, 404);
  }
  if (!existing.archived_at) {
    return c.json({ error: "not_archived", message: "Page is not archived" }, 409);
  }
  if (existing.archive_root_id !== pageId) {
    return c.json({ error: "not_archive_root", message: "Only archive roots can be restored" }, 409);
  }

  const archivedAncestors = await getArchivedAncestorRows(db, pageId, workspaceId);
  if (archivedAncestors.length > 0) {
    return c.json({ error: "archived_ancestor", message: "Restore the archived parent first" }, 409);
  }

  const subtreeRows = await getPageSubtreeRows(db, pageId, workspaceId);
  const rowsToRestore = subtreeRows.filter((row) => row.archive_root_id === pageId);
  const entitlements = getPageStructureEntitlements(membership.role, existing.created_by === user.id);
  if (
    !entitlements.archiveAnyPage &&
    (!entitlements.archiveOwnPage || rowsToRestore.some((row) => row.created_by !== user.id))
  ) {
    return c.json({ error: "forbidden", message: "You do not have permission to restore this archived page" }, 403);
  }

  const now = new Date().toISOString();
  await restorePageSubtree(db, pageId, workspaceId, now);
  await bumpPublicSiteRevision(db, workspaceId, now);
  log.info("page_restored", { pageId, workspaceId, userId: user.id, restoredCount: rowsToRestore.length });

  try {
    await enqueueIndexPageMessages(
      c.env,
      rowsToRestore.map((row) => row.id),
    );
  } catch {
    // Non-critical: FTS is a derived projection.
  }

  return c.json({
    ok: true,
    pages: rowsToRestore.map((row) =>
      serializeSubtreePage(row, { archived_at: null, archive_root_id: null, updated_at: now }),
    ),
  });
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

  const entitlements = getPageStructureEntitlements(membership.role, isCreator);
  if (!entitlements.archivePage) {
    return c.json({ error: "forbidden", message: "Only the page creator or workspace admins can archive pages" }, 403);
  }

  const subtreeRows = await getPageSubtreeRows(db, pageId, workspaceId);
  const rowsToArchive = subtreeRows.filter((row) => row.archived_at === null);
  if (!entitlements.archiveAnyPage && rowsToArchive.some((row) => row.created_by !== user.id)) {
    return c.json({ error: "forbidden", message: "Members can only archive pages they created" }, 403);
  }

  const now = new Date().toISOString();

  await archivePageSubtree(db, pageId, workspaceId, now);
  await bumpPublicSiteRevision(db, workspaceId, now);
  log.info("page_archived", { pageId, workspaceId, userId: user.id, archivedCount: rowsToArchive.length });

  try {
    await enqueueIndexPageMessages(
      c.env,
      rowsToArchive.map((row) => row.id),
    );
  } catch {
    // Non-critical: FTS is a derived projection.
  }

  return c.json({ ok: true, archived_page_ids: rowsToArchive.map((row) => row.id) });
});

export { pagesRouter };

function isAllowedPageCoverUrl(coverUrl: string | null): boolean {
  if (coverUrl === null) return true;
  if (parseUploadCoverUrl(coverUrl)) return true;
  return isGradientPreset(coverUrl);
}

async function enqueueSiteCover(env: Pick<Env, "TASKS_QUEUE">, pageId: string): Promise<void> {
  try {
    await env.TASKS_QUEUE.send({ type: "site-cover", pageId });
  } catch {
    // Cover images are derived artifacts; save success should not depend on queue delivery.
  }
}

function serializeSubtreePage(
  row: PageSubtreeRow,
  overrides: Partial<Pick<Page, "archived_at" | "archive_root_id" | "updated_at">> = {},
): Page {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    parent_id: row.parent_id,
    kind: row.kind,
    title: row.title,
    icon: row.icon,
    cover_url: row.cover_url,
    position: row.position,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: "updated_at" in overrides ? (overrides.updated_at ?? row.updated_at) : row.updated_at,
    archived_at: "archived_at" in overrides ? (overrides.archived_at ?? null) : row.archived_at,
    archive_root_id: "archive_root_id" in overrides ? (overrides.archive_root_id ?? null) : row.archive_root_id,
  };
}

export async function enqueueIndexPageMessages(
  env: Pick<Env, "TASKS_QUEUE">,
  pageIds: readonly string[],
): Promise<void> {
  for (let offset = 0; offset < pageIds.length; offset += INDEX_QUEUE_BATCH_SIZE) {
    const batch = pageIds.slice(offset, offset + INDEX_QUEUE_BATCH_SIZE).map((pageId) => {
      const body: TasksQueueMessage = { type: "index-page", pageId };
      return { body };
    });
    if (batch.length > 0) {
      await env.TASKS_QUEUE.sendBatch(batch);
    }
  }
}
