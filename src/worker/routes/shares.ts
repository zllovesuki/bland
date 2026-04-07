import { Hono } from "hono";
import { eq, and, isNull } from "drizzle-orm";
import { ulid } from "ulidx";

import { pageShares, pages, users } from "@/worker/db/schema";
import { requireAuth } from "@/worker/middleware/auth";
import { rateLimit } from "@/worker/middleware/rate-limit";
import { checkMembership, requireMembership } from "@/worker/lib/membership";
import { isAdminOrOwner, canAccessPage } from "@/worker/lib/permissions";
import { generateSecureToken } from "@/worker/lib/auth";
import { parseBody } from "@/worker/lib/validate";
import { createLogger } from "@/worker/lib/logger";
import { getPage } from "@/worker/lib/page-access";
import { CreateShareRequest } from "@/shared/types";
import type { AppContext } from "@/worker/router";

const log = createLogger("shares");

// Share CRUD — mounted under /api/v1
export const sharesRouter = new Hono<AppContext>();

// POST /pages/:id/share - Create share
sharesRouter.post("/pages/:id/share", requireAuth, rateLimit("RL_API"), async (c) => {
  const pageId = c.req.param("id");
  const user = c.get("user")!;
  const db = c.get("db");

  const page = await getPage(db, pageId);
  if (!page) {
    return c.json({ error: "not_found", message: "Page not found" }, 404);
  }

  const membership = await requireMembership(c, db, user.id, page.workspace_id, true);
  if (membership instanceof Response) return membership;

  const data = await parseBody(c, CreateShareRequest);
  if (data instanceof Response) return data;

  // Authorization per spec §10.8
  if (membership.role === "guest") {
    return c.json({ error: "forbidden", message: "Guests cannot manage shares" }, 403);
  }

  if (data.grantee_type === "link") {
    // Only admin/owner can create link shares
    if (!isAdminOrOwner(membership.role)) {
      return c.json({ error: "forbidden", message: "Only admins and owners can create link shares" }, 403);
    }

    // Prevent duplicate link shares with the same permission on the same page
    const existingLink = await db
      .select({ id: pageShares.id })
      .from(pageShares)
      .where(
        and(
          eq(pageShares.page_id, pageId),
          eq(pageShares.grantee_type, "link"),
          eq(pageShares.permission, data.permission),
        ),
      )
      .get();
    if (existingLink) {
      return c.json({ error: "conflict", message: "A link share with this permission already exists" }, 409);
    }
  }

  let resolvedGranteeId: string | null = null;

  if (data.grantee_type === "user") {
    if (data.grantee_id && data.grantee_email) {
      return c.json({ error: "validation_error", message: "Provide grantee_id or grantee_email, not both" }, 400);
    }

    if (data.grantee_id) {
      resolvedGranteeId = data.grantee_id;
    } else if (data.grantee_email) {
      // Only admin/owner can use email lookup to prevent account enumeration
      if (!isAdminOrOwner(membership.role)) {
        return c.json({ error: "forbidden", message: "Only admins and owners can share by email" }, 403);
      }
      const normalizedEmail = data.grantee_email.toLowerCase();
      const target = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).get();
      if (!target) {
        return c.json({ error: "not_found", message: "No account with that email" }, 404);
      }
      resolvedGranteeId = target.id;
    } else {
      return c.json(
        { error: "validation_error", message: "grantee_id or grantee_email is required for user shares" },
        400,
      );
    }

    if (resolvedGranteeId === user.id) {
      return c.json({ error: "bad_request", message: "You cannot share a page with yourself" }, 400);
    }

    // Admin/owner can share with any registered user.
    // Members can only share with existing workspace members.
    if (!isAdminOrOwner(membership.role)) {
      const targetMembership = await checkMembership(db, resolvedGranteeId, page.workspace_id);
      if (!targetMembership) {
        return c.json({ error: "bad_request", message: "Members can only share with workspace members" }, 400);
      }
    }

    // Prevent duplicate user shares for the same grantee on the same page
    const existing = await db
      .select({ id: pageShares.id })
      .from(pageShares)
      .where(
        and(
          eq(pageShares.page_id, pageId),
          eq(pageShares.grantee_type, "user"),
          eq(pageShares.grantee_id, resolvedGranteeId),
        ),
      )
      .get();
    if (existing) {
      return c.json({ error: "conflict", message: "A share already exists for this user on this page" }, 409);
    }
  }

  const shareId = ulid();
  const linkToken = data.grantee_type === "link" ? generateSecureToken() : null;

  await db.insert(pageShares).values({
    id: shareId,
    page_id: pageId,
    grantee_type: data.grantee_type,
    grantee_id: resolvedGranteeId,
    permission: data.permission,
    link_token: linkToken,
    created_by: user.id,
  });

  log.info("share_created", {
    shareId,
    pageId,
    granteeType: data.grantee_type,
    permission: data.permission,
  });

  const row = await db
    .select({
      id: pageShares.id,
      page_id: pageShares.page_id,
      grantee_type: pageShares.grantee_type,
      grantee_id: pageShares.grantee_id,
      permission: pageShares.permission,
      link_token: pageShares.link_token,
      created_by: pageShares.created_by,
      created_at: pageShares.created_at,
      grantee_name: users.name,
      grantee_email: users.email,
    })
    .from(pageShares)
    .leftJoin(users, eq(pageShares.grantee_id, users.id))
    .where(eq(pageShares.id, shareId))
    .get();

  const share = row
    ? {
        id: row.id,
        page_id: row.page_id,
        grantee_type: row.grantee_type,
        grantee_id: row.grantee_id,
        permission: row.permission,
        link_token: row.link_token,
        created_by: row.created_by,
        created_at: row.created_at,
        grantee_user:
          row.grantee_id && row.grantee_name
            ? { id: row.grantee_id, name: row.grantee_name, email: row.grantee_email! }
            : null,
      }
    : null;

  return c.json({ share }, 201);
});

// GET /pages/:id/share - List shares on a page
sharesRouter.get("/pages/:id/share", requireAuth, rateLimit("RL_API"), async (c) => {
  const pageId = c.req.param("id");
  const user = c.get("user")!;
  const db = c.get("db");

  const page = await getPage(db, pageId);
  if (!page) {
    return c.json({ error: "not_found", message: "Page not found" }, 404);
  }

  const membership = await checkMembership(db, user.id, page.workspace_id);

  // Guests and non-members need page-level view access
  if (!membership || membership.role === "guest") {
    const hasAccess = await canAccessPage(db, { type: "user", userId: user.id }, pageId, page.workspace_id, "view");
    if (!hasAccess) {
      return c.json({ error: "forbidden", message: "You do not have access to this page" }, 403);
    }
  }

  const rows = await db
    .select({
      id: pageShares.id,
      page_id: pageShares.page_id,
      grantee_type: pageShares.grantee_type,
      grantee_id: pageShares.grantee_id,
      permission: pageShares.permission,
      link_token: pageShares.link_token,
      created_by: pageShares.created_by,
      created_at: pageShares.created_at,
      grantee_name: users.name,
      grantee_email: users.email,
    })
    .from(pageShares)
    .leftJoin(users, eq(pageShares.grantee_id, users.id))
    .where(eq(pageShares.page_id, pageId));

  // Redact link_token for non-admin/owner per spec §10.8
  // Redact grantee emails for non-members to prevent enumeration
  const isMemberWithRole = membership && membership.role !== "guest";
  const canSeeLinkTokens = membership ? isAdminOrOwner(membership.role) : false;
  const result = rows.map((s) => ({
    id: s.id,
    page_id: s.page_id,
    grantee_type: s.grantee_type,
    grantee_id: s.grantee_id,
    permission: s.permission,
    link_token: canSeeLinkTokens ? s.link_token : null,
    created_by: s.created_by,
    created_at: s.created_at,
    grantee_user:
      s.grantee_id && s.grantee_name
        ? { id: s.grantee_id, name: s.grantee_name, email: isMemberWithRole ? s.grantee_email! : "" }
        : null,
  }));

  return c.json({ shares: result });
});

// DELETE /pages/:id/share/:shareId - Revoke share
sharesRouter.delete("/pages/:id/share/:shareId", requireAuth, rateLimit("RL_API"), async (c) => {
  const pageId = c.req.param("id");
  const shareId = c.req.param("shareId");
  const user = c.get("user")!;
  const db = c.get("db");

  const page = await getPage(db, pageId);
  if (!page) {
    return c.json({ error: "not_found", message: "Page not found" }, 404);
  }

  const membership = await requireMembership(c, db, user.id, page.workspace_id, true);
  if (membership instanceof Response) return membership;

  if (membership.role === "guest") {
    return c.json({ error: "forbidden", message: "Guests cannot manage shares" }, 403);
  }

  const share = await db
    .select()
    .from(pageShares)
    .where(and(eq(pageShares.id, shareId), eq(pageShares.page_id, pageId)))
    .get();
  if (!share) {
    return c.json({ error: "not_found", message: "Share not found" }, 404);
  }

  // Members can only revoke workspace-member user shares they created
  if (!isAdminOrOwner(membership.role)) {
    if (share.grantee_type === "link") {
      return c.json({ error: "forbidden", message: "Only admins and owners can revoke link shares" }, 403);
    }
    if (share.created_by !== user.id) {
      return c.json({ error: "forbidden", message: "You can only revoke shares you created" }, 403);
    }
    // Verify the grantee is still a workspace member (members can only revoke member shares)
    if (share.grantee_id) {
      const granteeInWorkspace = await checkMembership(db, share.grantee_id, page.workspace_id);
      if (!granteeInWorkspace) {
        return c.json({ error: "forbidden", message: "Members can only revoke workspace-member user shares" }, 403);
      }
    }
  }

  await db.delete(pageShares).where(eq(pageShares.id, shareId));

  log.info("share_revoked", { shareId, pageId });

  return c.json({ ok: true });
});

// Share link resolution — mounted under /api/v1
export const shareLinkRouter = new Hono<AppContext>();

// GET /share/:token - Resolve share link (no auth required)
shareLinkRouter.get("/share/:token", rateLimit("RL_API"), async (c) => {
  const token = c.req.param("token");
  const db = c.get("db");

  const share = await db
    .select()
    .from(pageShares)
    .where(and(eq(pageShares.link_token, token), eq(pageShares.grantee_type, "link")))
    .get();

  if (!share) {
    return c.json({ error: "not_found", message: "Share link not found or expired" }, 404);
  }

  const page = await getPage(db, share.page_id);
  if (!page) {
    return c.json({ error: "not_found", message: "Page not found" }, 404);
  }

  return c.json({
    page_id: page.id,
    workspace_id: page.workspace_id,
    title: page.title,
    icon: page.icon,
    cover_url: page.cover_url,
    permission: share.permission,
    token,
  });
});
