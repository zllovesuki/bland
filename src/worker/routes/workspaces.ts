import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { ulid } from "ulidx";

import { workspaces, memberships, users, pages, invites, docSnapshots, pageShares, uploads } from "@/worker/db/schema";
import { requireAuth } from "@/worker/middleware/auth";
import { rateLimit } from "@/worker/middleware/rate-limit";
import { checkMembership } from "@/worker/lib/membership";
import { isAdminOrOwner } from "@/worker/lib/permissions";
import { parseBody } from "@/worker/lib/validate";
import { createLogger } from "@/worker/lib/logger";
import { CreateWorkspaceRequest, UpdateWorkspaceRequest, UpdateMemberRoleRequest } from "@/shared/types";
import type { AppContext } from "@/worker/router";

const workspacesRouter = new Hono<AppContext>();
const log = createLogger("workspaces");

// POST /workspaces - Create workspace
workspacesRouter.post("/workspaces", requireAuth, rateLimit("RL_API"), async (c) => {
  const data = await parseBody(c, CreateWorkspaceRequest);
  if (data instanceof Response) return data;

  const { name, slug, icon } = data;
  const user = c.get("user")!;
  const db = c.get("db");

  // Check slug uniqueness
  const existing = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.slug, slug)).limit(1);

  if (existing.length > 0) {
    return c.json({ error: "conflict", message: "A workspace with this slug already exists" }, 409);
  }

  const workspaceId = ulid();

  await db.batch([
    db.insert(workspaces).values({
      id: workspaceId,
      name,
      slug,
      icon: icon ?? null,
      owner_id: user.id,
    }),
    db.insert(memberships).values({
      user_id: user.id,
      workspace_id: workspaceId,
      role: "owner",
    }),
  ]);

  log.info("workspace_created", { workspaceId, slug, userId: user.id });

  return c.json(
    {
      workspace: {
        id: workspaceId,
        name,
        slug,
        icon: icon ?? null,
        owner_id: user.id,
        created_at: new Date().toISOString(),
      },
    },
    201,
  );
});

// GET /workspaces - List user's workspaces
workspacesRouter.get("/workspaces", requireAuth, rateLimit("RL_API"), async (c) => {
  const user = c.get("user")!;
  const db = c.get("db");

  const result = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      icon: workspaces.icon,
      owner_id: workspaces.owner_id,
      created_at: workspaces.created_at,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(memberships.workspace_id, workspaces.id))
    .where(eq(memberships.user_id, user.id));

  return c.json({ workspaces: result });
});

// PATCH /workspaces/:id - Update workspace
workspacesRouter.patch("/workspaces/:id", requireAuth, rateLimit("RL_API"), async (c) => {
  const workspaceId = c.req.param("id");
  const user = c.get("user")!;
  const db = c.get("db");

  const membership = await checkMembership(db, user.id, workspaceId);
  if (!membership || membership.role !== "owner") {
    return c.json({ error: "forbidden", message: "Only the workspace owner can update workspace settings" }, 403);
  }

  const data = await parseBody(c, UpdateWorkspaceRequest);
  if (data instanceof Response) return data;

  if (Object.keys(data).length === 0) {
    return c.json({ error: "bad_request", message: "No fields to update" }, 400);
  }

  // Check slug uniqueness if changing slug
  if (data.slug) {
    const existing = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, data.slug))
      .limit(1);

    if (existing.length > 0 && existing[0].id !== workspaceId) {
      return c.json({ error: "conflict", message: "A workspace with this slug already exists" }, 409);
    }
  }

  const updateValues: Record<string, unknown> = {};
  if (data.name !== undefined) updateValues.name = data.name;
  if (data.slug !== undefined) updateValues.slug = data.slug;
  if (data.icon !== undefined) updateValues.icon = data.icon;

  await db.update(workspaces).set(updateValues).where(eq(workspaces.id, workspaceId));
  log.info("workspace_updated", { workspaceId, fields: Object.keys(updateValues) });

  const updated = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);

  if (updated.length === 0) {
    return c.json({ error: "not_found", message: "Workspace not found" }, 404);
  }

  return c.json({ workspace: updated[0] });
});

// DELETE /workspaces/:id - Delete workspace
workspacesRouter.delete("/workspaces/:id", requireAuth, rateLimit("RL_API"), async (c) => {
  const workspaceId = c.req.param("id");
  const user = c.get("user")!;
  const db = c.get("db");

  const membership = await checkMembership(db, user.id, workspaceId);
  if (!membership || membership.role !== "owner") {
    return c.json({ error: "forbidden", message: "Only the workspace owner can delete it" }, 403);
  }

  const workspacePages = await db.select({ id: pages.id }).from(pages).where(eq(pages.workspace_id, workspaceId));
  const pageIds = workspacePages.map((p) => p.id);

  const batchOps = [
    ...pageIds.flatMap((pid) => [
      db.delete(uploads).where(eq(uploads.page_id, pid)),
      db.delete(docSnapshots).where(eq(docSnapshots.page_id, pid)),
      db.delete(pageShares).where(eq(pageShares.page_id, pid)),
    ]),
    db.delete(pages).where(eq(pages.workspace_id, workspaceId)),
    db.delete(memberships).where(eq(memberships.workspace_id, workspaceId)),
    db.delete(invites).where(eq(invites.workspace_id, workspaceId)),
    db.delete(workspaces).where(eq(workspaces.id, workspaceId)),
  ];

  // db.batch() requires a non-empty tuple type; cast needed for dynamically-built arrays
  await db.batch(batchOps as [(typeof batchOps)[number], ...(typeof batchOps)[number][]]);
  log.info("workspace_deleted", { workspaceId, userId: user.id, pageCount: pageIds.length });

  return c.json({ ok: true });
});

// GET /workspaces/:id/members - List members
workspacesRouter.get("/workspaces/:id/members", requireAuth, rateLimit("RL_API"), async (c) => {
  const workspaceId = c.req.param("id");
  const user = c.get("user")!;
  const db = c.get("db");

  const membership = await checkMembership(db, user.id, workspaceId);
  if (!membership) {
    return c.json({ error: "forbidden", message: "You are not a member of this workspace" }, 403);
  }

  const rows = await db
    .select({
      user_id: memberships.user_id,
      workspace_id: memberships.workspace_id,
      role: memberships.role,
      joined_at: memberships.joined_at,
      id: users.id,
      email: users.email,
      name: users.name,
      avatar_url: users.avatar_url,
      user_created_at: users.created_at,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.user_id, users.id))
    .where(eq(memberships.workspace_id, workspaceId));

  const members = rows.map((row) => ({
    user_id: row.user_id,
    workspace_id: row.workspace_id,
    role: row.role,
    joined_at: row.joined_at,
    user: { id: row.id, email: row.email, name: row.name, avatar_url: row.avatar_url, created_at: row.user_created_at },
  }));

  return c.json({ members });
});

// PATCH /workspaces/:id/members/:uid - Change member role
workspacesRouter.patch("/workspaces/:id/members/:uid", requireAuth, rateLimit("RL_API"), async (c) => {
  const workspaceId = c.req.param("id");
  const targetUserId = c.req.param("uid");
  const user = c.get("user")!;
  const db = c.get("db");

  const callerMembership = await checkMembership(db, user.id, workspaceId);
  if (!callerMembership || !isAdminOrOwner(callerMembership.role)) {
    return c.json({ error: "forbidden", message: "Only owners and admins can change member roles" }, 403);
  }

  const data = await parseBody(c, UpdateMemberRoleRequest);
  if (data instanceof Response) return data;

  const { role } = data;

  // Cannot change the owner's role
  const targetMembership = await checkMembership(db, targetUserId, workspaceId);
  if (!targetMembership) {
    return c.json({ error: "not_found", message: "Member not found" }, 404);
  }

  if (targetMembership.role === "owner") {
    return c.json({ error: "forbidden", message: "Cannot change the owner's role" }, 403);
  }

  // Only owner can promote to admin
  if (role === "admin" && callerMembership.role !== "owner") {
    return c.json({ error: "forbidden", message: "Only the owner can promote members to admin" }, 403);
  }

  await db
    .update(memberships)
    .set({ role })
    .where(and(eq(memberships.user_id, targetUserId), eq(memberships.workspace_id, workspaceId)));
  log.info("member_role_changed", { workspaceId, targetUserId, role, byUserId: user.id });

  return c.json({ ok: true, role });
});

// DELETE /workspaces/:id/members/:uid - Remove member
workspacesRouter.delete("/workspaces/:id/members/:uid", requireAuth, rateLimit("RL_API"), async (c) => {
  const workspaceId = c.req.param("id");
  const targetUserId = c.req.param("uid");
  const user = c.get("user")!;
  const db = c.get("db");

  const callerMembership = await checkMembership(db, user.id, workspaceId);
  if (!callerMembership) {
    return c.json({ error: "forbidden", message: "You are not a member of this workspace" }, 403);
  }

  // Self-removal is always allowed (except owner)
  const isSelf = user.id === targetUserId;

  if (isSelf && callerMembership.role === "owner") {
    return c.json(
      { error: "forbidden", message: "The owner cannot leave the workspace. Transfer ownership first." },
      403,
    );
  }

  if (!isSelf && !isAdminOrOwner(callerMembership.role)) {
    return c.json({ error: "forbidden", message: "Only owners and admins can remove members" }, 403);
  }

  // Cannot remove the owner
  if (!isSelf) {
    const targetMembership = await checkMembership(db, targetUserId, workspaceId);
    if (!targetMembership) {
      return c.json({ error: "not_found", message: "Member not found" }, 404);
    }
    if (targetMembership.role === "owner") {
      return c.json({ error: "forbidden", message: "Cannot remove the workspace owner" }, 403);
    }
    // Admins cannot remove other admins
    if (targetMembership.role === "admin" && callerMembership.role !== "owner") {
      return c.json({ error: "forbidden", message: "Only the owner can remove admins" }, 403);
    }
  }

  await db
    .delete(memberships)
    .where(and(eq(memberships.user_id, targetUserId), eq(memberships.workspace_id, workspaceId)));
  log.info("member_removed", { workspaceId, targetUserId, isSelf, byUserId: user.id });

  return c.json({ ok: true });
});

export { workspacesRouter };
