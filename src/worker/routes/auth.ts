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
} from "@/worker/lib/auth";
import { parseBody } from "@/worker/lib/validate";
import { LoginRequest } from "@/shared/types";
import type { AppContext } from "@/worker/router";

const auth = new Hono<AppContext>();

// POST /auth/login
auth.post("/auth/login", rateLimit("RL_AUTH"), async (c) => {
  const data = await parseBody(c, LoginRequest);
  if (data instanceof Response) return data;

  const { email, password, turnstileToken } = data;

  const turnstile = await verifyTurnstileToken(c.env, {
    token: turnstileToken,
    expectedAction: "login",
    remoteIp: c.req.header("cf-connecting-ip"),
    requestUrl: c.req.url,
  });

  if (!turnstile.ok) {
    return c.json({ error: "turnstile_failed", message: turnstile.message }, turnstile.status);
  }

  const db = c.get("db");

  const result = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);

  if (result.length === 0) {
    return c.json({ error: "unauthorized", message: "Invalid email or password" }, 401);
  }

  const user = result[0];

  if (!verifyPassword(password, user.password_hash)) {
    return c.json({ error: "unauthorized", message: "Invalid email or password" }, 401);
  }

  const [accessToken, refreshToken] = await Promise.all([
    createAccessToken(user.id, c.env),
    createRefreshToken(user.id, c.env),
  ]);

  setRefreshCookie(c, refreshToken);

  return c.json({ user: toUserResponse(user), accessToken });
});

// POST /auth/refresh
auth.post("/auth/refresh", rateLimit("RL_AUTH"), async (c) => {
  const cookies = parseCookies(c.req.header("cookie"));
  const refreshToken = cookies.bland_refresh;

  if (!refreshToken) {
    return c.json({ error: "unauthorized", message: "No refresh token" }, 401);
  }

  try {
    const secret = new TextEncoder().encode(c.env.JWT_SECRET);
    const { payload } = await jwtVerify(refreshToken, secret, {
      algorithms: ["HS256"],
    });

    if (!payload.sub || payload.type !== "refresh") {
      return c.json({ error: "unauthorized", message: "Invalid refresh token" }, 401);
    }

    const db = c.get("db");
    const result = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);

    if (result.length === 0) {
      clearRefreshCookie(c);
      return c.json({ error: "unauthorized", message: "User not found" }, 401);
    }

    const user = result[0];
    const accessToken = await createAccessToken(user.id, c.env);

    return c.json({ user: toUserResponse(user), accessToken });
  } catch {
    clearRefreshCookie(c);
    return c.json({ error: "unauthorized", message: "Invalid or expired refresh token" }, 401);
  }
});

// POST /auth/logout
auth.post("/auth/logout", rateLimit("RL_API"), (c) => {
  clearRefreshCookie(c);
  return c.json({ ok: true });
});

// GET /auth/me
auth.get("/auth/me", requireAuth, rateLimit("RL_API"), async (c) => {
  const user = c.get("user")!;
  return c.json({ user: toUserResponse(user) });
});

export { auth };
