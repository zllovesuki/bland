import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";

import type { AppContext } from "@/worker/app-context";
import { invites, memberships, users, workspaces } from "@/worker/db/d1/schema";
import { requireAuth, extractBearerToken } from "@/worker/middleware/auth";
import { rateLimit } from "@/worker/middleware/rate-limit";
import { verifyTurnstileToken } from "@/worker/middleware/turnstile";
import {
  hashPassword,
  verifyPassword,
  createAccessToken,
  createRefreshToken,
  setRefreshCookie,
  verifyAccessToken,
  generateSecureToken,
} from "@/worker/lib/auth";
import { checkMembership } from "@/worker/lib/membership";
import { parseBody } from "@/worker/lib/validate";
import { createLogger } from "@/worker/lib/logger";
import { CF_IP_HEADER, INVITE_EXPIRY_MS } from "@/worker/lib/constants";
import { CreateInviteRequest, AcceptInviteRequest } from "@/shared/types";

const log = createLogger("invites");

type InviteRow = { revoked_at: string | null; accepted_at: string | null; expires_at: string };

function validateInviteState(invite: InviteRow): { error: string; message: string; status: 410 } | null {
  if (invite.revoked_at) return { error: "gone", message: "This invite has been revoked", status: 410 };
  if (invite.accepted_at) return { error: "gone", message: "This invite has already been accepted", status: 410 };
  if (new Date(invite.expires_at) < new Date())
    return { error: "gone", message: "This invite has expired", status: 410 };
  return null;
}

const invitesRouter = new Hono<AppContext>();
invitesRouter.post("/workspaces/:wid/invite", requireAuth, rateLimit("RL_API"), async (c) => {
  const workspaceId = c.req.param("wid");
  const user = c.get("user")!;
  const db = c.get("db");

  const data = await parseBody(c, CreateInviteRequest);
  if (data instanceof Response) return data;

  const { email, role } = data;

  // Check user is a member of the workspace
  const membership = await checkMembership(db, user.id, workspaceId);
  if (!membership) {
    return c.json({ error: "forbidden", message: "You are not a member of this workspace" }, 403);
  }

  // Any member role or above can create invites
  if (membership.role === "guest") {
    return c.json({ error: "forbidden", message: "Guests cannot create invites" }, 403);
  }

  // Members can only invite as member or guest
  if (role === "admin" && membership.role !== "owner" && membership.role !== "admin") {
    return c.json({ error: "forbidden", message: "Only owners and admins can invite as admin" }, 403);
  }

  const token = generateSecureToken();
  const inviteId = ulid();
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS).toISOString();

  await db.insert(invites).values({
    id: inviteId,
    email: email?.toLowerCase() ?? null,
    workspace_id: workspaceId,
    invited_by: user.id,
    role,
    token,
    expires_at: expiresAt,
  });

  log.info("invite_created", { inviteId, workspaceId, role, email: email?.toLowerCase() ?? null });

  const origin = new URL(c.req.url).origin;

  return c.json(
    {
      invite: {
        id: inviteId,
        token,
        role,
        email: email?.toLowerCase() ?? null,
        expires_at: expiresAt,
        invite_link: `${origin}/invite/${token}`,
      },
    },
    201,
  );
});

// GET /invite/:token
invitesRouter.get("/invite/:token", async (c) => {
  const token = c.req.param("token");
  const db = c.get("db");

  const result = await db
    .select({
      id: invites.id,
      email: invites.email,
      role: invites.role,
      workspace_id: invites.workspace_id,
      expires_at: invites.expires_at,
      accepted_at: invites.accepted_at,
      revoked_at: invites.revoked_at,
      workspace_name: workspaces.name,
      workspace_icon: workspaces.icon,
      invited_by_name: users.name,
    })
    .from(invites)
    .innerJoin(workspaces, eq(invites.workspace_id, workspaces.id))
    .innerJoin(users, eq(invites.invited_by, users.id))
    .where(eq(invites.token, token))
    .get();

  if (!result) {
    return c.json({ error: "not_found", message: "Invite not found" }, 404);
  }

  const stateError = validateInviteState(result);
  if (stateError) return c.json({ error: stateError.error, message: stateError.message }, stateError.status);

  return c.json({
    invite: {
      id: result.id,
      email: result.email,
      role: result.role,
      workspace_name: result.workspace_name,
      workspace_icon: result.workspace_icon,
      invited_by_name: result.invited_by_name,
    },
  });
});

// POST /invite/:token/accept
invitesRouter.post("/invite/:token/accept", rateLimit("RL_AUTH"), async (c) => {
  const token = c.req.param("token");
  const db = c.get("db");

  const data = await parseBody(c, AcceptInviteRequest);
  if (data instanceof Response) return data;

  const { turnstileToken, email, password, name } = data;

  const turnstile = await verifyTurnstileToken(c.env, {
    token: turnstileToken,
    expectedAction: "accept_invite",
    remoteIp: c.req.header(CF_IP_HEADER),
    requestUrl: c.req.url,
  });

  if (!turnstile.ok) {
    return c.json({ error: "turnstile_failed", message: turnstile.message }, turnstile.status);
  }

  // Load invite
  const invite = await db.select().from(invites).where(eq(invites.token, token)).get();

  if (!invite) {
    return c.json({ error: "not_found", message: "Invite not found" }, 404);
  }

  const stateError = validateInviteState(invite);
  if (stateError) return c.json({ error: stateError.error, message: stateError.message }, stateError.status);

  // If invite is pinned to a specific email, enforce it (pre-check for new-user flow)
  if (invite.email && email && email.toLowerCase() !== invite.email) {
    return c.json({ error: "forbidden", message: "This invite is for a different email address" }, 403);
  }

  let userId: string;
  let userName: string;
  let userEmail: string;
  let userAvatarUrl: string | null = null;
  let userCreatedAt: string = new Date().toISOString();
  let isNewUser = false;

  // Check if creating a new user account
  if (email && password && name) {
    // Creating new user
    const existingUser = await db.select().from(users).where(eq(users.email, email.toLowerCase())).get();

    if (existingUser) {
      // User exists - verify password before proceeding
      if (!verifyPassword(password, existingUser.password_hash)) {
        return c.json({ error: "unauthorized", message: "Invalid password for existing account" }, 401);
      }

      userId = existingUser.id;
      userName = existingUser.name;
      userEmail = existingUser.email;
      userAvatarUrl = existingUser.avatar_url;
      userCreatedAt = existingUser.created_at;
    } else {
      userId = ulid();
      const passwordHash = hashPassword(password);

      await db.insert(users).values({
        id: userId,
        email: email.toLowerCase(),
        password_hash: passwordHash,
        name,
      });

      userName = name;
      userEmail = email.toLowerCase();
      isNewUser = true;
    }
  } else {
    // Existing user must be authenticated
    const token = extractBearerToken(c.req.header("authorization"));
    if (!token) {
      return c.json(
        {
          error: "bad_request",
          message: "Either provide email/password/name to create an account, or authenticate with a Bearer token",
        },
        400,
      );
    }

    try {
      const { sub } = await verifyAccessToken(token, c.env);
      userId = sub;
      const fullUser = await db.select().from(users).where(eq(users.id, userId)).get();

      if (!fullUser) {
        return c.json({ error: "unauthorized", message: "User not found" }, 401);
      }

      userName = fullUser.name;
      userEmail = fullUser.email;
      userAvatarUrl = fullUser.avatar_url;
      userCreatedAt = fullUser.created_at;

      // If invite is pinned to a specific email, enforce it (authenticated user flow)
      if (invite.email && userEmail.toLowerCase() !== invite.email) {
        return c.json({ error: "forbidden", message: "This invite is for a different email address" }, 403);
      }
    } catch {
      return c.json({ error: "unauthorized", message: "Invalid token" }, 401);
    }
  }

  const userPayload = {
    id: userId,
    email: userEmail,
    name: userName,
    avatar_url: userAvatarUrl,
    created_at: userCreatedAt,
  };

  // Check if already a member
  const existingMembership = await checkMembership(db, userId, invite.workspace_id);
  if (existingMembership) {
    // Mark invite as accepted but don't create duplicate membership
    await db
      .update(invites)
      .set({ accepted_at: new Date().toISOString(), accepted_by: userId })
      .where(eq(invites.id, invite.id));

    const [accessToken, refreshToken] = await Promise.all([
      createAccessToken(userId, c.env),
      createRefreshToken(userId, c.env),
    ]);
    setRefreshCookie(c, refreshToken);

    log.info("invite_accepted", {
      inviteId: invite.id,
      userId,
      workspaceId: invite.workspace_id,
      isNewUser: false,
      alreadyMember: true,
    });

    return c.json({
      user: userPayload,
      workspace_id: invite.workspace_id,
      accessToken,
      already_member: true,
    });
  }

  // Create membership and mark invite accepted
  const now = new Date().toISOString();

  await db.batch([
    db.insert(memberships).values({
      user_id: userId,
      workspace_id: invite.workspace_id,
      role: invite.role,
    }),
    db.update(invites).set({ accepted_at: now, accepted_by: userId }).where(eq(invites.id, invite.id)),
  ]);

  const [accessToken, refreshToken] = await Promise.all([
    createAccessToken(userId, c.env),
    createRefreshToken(userId, c.env),
  ]);

  setRefreshCookie(c, refreshToken);
  log.info("invite_accepted", {
    inviteId: invite.id,
    userId,
    workspaceId: invite.workspace_id,
    isNewUser,
    alreadyMember: false,
  });

  return c.json(
    {
      user: userPayload,
      workspace_id: invite.workspace_id,
      accessToken,
      is_new_user: isNewUser,
    },
    isNewUser ? 201 : 200,
  );
});

// DELETE /invite/:id
invitesRouter.delete("/invite/:id", requireAuth, rateLimit("RL_API"), async (c) => {
  const inviteId = c.req.param("id");
  const user = c.get("user")!;
  const db = c.get("db");

  const invite = await db.select().from(invites).where(eq(invites.id, inviteId)).get();

  if (!invite) {
    return c.json({ error: "not_found", message: "Invite not found" }, 404);
  }

  // Check if user created the invite or is an admin/owner of the workspace
  if (invite.invited_by !== user.id) {
    const membership = await checkMembership(db, user.id, invite.workspace_id);
    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      return c.json({ error: "forbidden", message: "You cannot revoke this invite" }, 403);
    }
  }

  if (invite.revoked_at) {
    return c.json({ error: "conflict", message: "Invite is already revoked" }, 409);
  }

  await db.update(invites).set({ revoked_at: new Date().toISOString() }).where(eq(invites.id, inviteId));
  log.info("invite_revoked", { inviteId, byUserId: user.id });

  return c.json({ ok: true });
});

export { invitesRouter };
