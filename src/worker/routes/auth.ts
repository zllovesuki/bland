import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";

import { users } from "@/worker/db/schema";
import { requireAuth } from "@/worker/middleware/auth";
import { rateLimit } from "@/worker/middleware/rate-limit";
import { verifyTurnstileToken } from "@/worker/middleware/turnstile";
import {
  hashPassword,
  verifyPassword,
  createAccessToken,
  createRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  parseCookies,
  toUserResponse,
  getJwtSecret,
  REFRESH_COOKIE,
} from "@/worker/lib/auth";
import { parseBody } from "@/worker/lib/validate";
import { createLogger } from "@/worker/lib/logger";
import { CF_IP_HEADER, JWT_ALGORITHM } from "@/worker/lib/constants";
import { LoginRequest, UpdateProfileRequest } from "@/shared/types";
import type { AppContext } from "@/worker/router";

const auth = new Hono<AppContext>();
const log = createLogger("auth");

// POST /auth/login
auth.post("/auth/login", rateLimit("RL_AUTH"), async (c) => {
  const data = await parseBody(c, LoginRequest);
  if (data instanceof Response) return data;

  const { email, password, turnstileToken } = data;
  log.debug("login_attempt", { email });

  const turnstile = await verifyTurnstileToken(c.env, {
    token: turnstileToken,
    expectedAction: "login",
    remoteIp: c.req.header(CF_IP_HEADER),
    requestUrl: c.req.url,
  });

  if (!turnstile.ok) {
    return c.json({ error: "turnstile_failed", message: turnstile.message }, turnstile.status);
  }

  const db = c.get("db");

  const user = await db.select().from(users).where(eq(users.email, email.toLowerCase())).get();

  if (!user) {
    log.info("login_failed", { email, reason: "user_not_found" });
    return c.json({ error: "unauthorized", message: "Invalid email or password" }, 401);
  }

  if (!verifyPassword(password, user.password_hash)) {
    log.info("login_failed", { email, reason: "bad_password" });
    return c.json({ error: "unauthorized", message: "Invalid email or password" }, 401);
  }

  const [accessToken, refreshToken] = await Promise.all([
    createAccessToken(user.id, c.env),
    createRefreshToken(user.id, c.env),
  ]);

  setRefreshCookie(c, refreshToken);
  log.info("login_success", { userId: user.id });

  return c.json({ user: toUserResponse(user), accessToken });
});

// POST /auth/refresh
auth.post("/auth/refresh", rateLimit("RL_AUTH"), async (c) => {
  const cookies = parseCookies(c.req.header("cookie"));
  const refreshToken = cookies[REFRESH_COOKIE];
  log.debug("refresh_attempt");

  if (!refreshToken) {
    log.info("refresh_failed", { reason: "no_token" });
    return c.json({ error: "unauthorized", message: "No refresh token" }, 401);
  }

  try {
    const { payload } = await jwtVerify(refreshToken, getJwtSecret(c.env), {
      algorithms: [JWT_ALGORITHM],
    });

    if (!payload.sub || payload.type !== "refresh") {
      log.info("refresh_failed", { reason: "invalid_token" });
      return c.json({ error: "unauthorized", message: "Invalid refresh token" }, 401);
    }

    const db = c.get("db");
    const user = await db.select().from(users).where(eq(users.id, payload.sub)).get();

    if (!user) {
      log.info("refresh_failed", { reason: "user_not_found" });
      clearRefreshCookie(c);
      return c.json({ error: "unauthorized", message: "User not found" }, 401);
    }
    const accessToken = await createAccessToken(user.id, c.env);
    log.info("refresh_success", { userId: user.id });

    return c.json({ user: toUserResponse(user), accessToken });
  } catch {
    log.info("refresh_failed", { reason: "expired_or_invalid" });
    clearRefreshCookie(c);
    return c.json({ error: "unauthorized", message: "Invalid or expired refresh token" }, 401);
  }
});

// POST /auth/logout
auth.post("/auth/logout", rateLimit("RL_API"), (c) => {
  log.debug("logout");
  clearRefreshCookie(c);
  return c.json({ ok: true });
});

// GET /auth/me
auth.get("/auth/me", requireAuth, rateLimit("RL_API"), async (c) => {
  const user = c.get("user")!;
  return c.json({ user: toUserResponse(user) });
});

// PATCH /auth/me - Update profile
auth.patch("/auth/me", requireAuth, rateLimit("RL_API"), async (c) => {
  const user = c.get("user")!;
  const db = c.get("db");

  const data = await parseBody(c, UpdateProfileRequest);
  if (data instanceof Response) return data;

  const updates: Record<string, string | null> = { updated_at: new Date().toISOString() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.avatar_url !== undefined) updates.avatar_url = data.avatar_url;

  await db.update(users).set(updates).where(eq(users.id, user.id));
  const updated = await db.select().from(users).where(eq(users.id, user.id)).get();

  return c.json({ user: toUserResponse(updated!) });
});

export { auth };
