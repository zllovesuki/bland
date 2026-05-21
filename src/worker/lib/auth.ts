import { SignJWT, jwtVerify } from "jose";
import { ulid } from "ulid";
import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import type { CookieOptions } from "hono/utils/cookie";

import { SESSION_HINT_COOKIE } from "@/shared/auth";
import { users } from "@/worker/db/d1/schema";
import { JWT_ALGORITHM, REFRESH_COOKIE_MAX_AGE } from "@/worker/lib/constants";

export const REFRESH_COOKIE = "bland_refresh";

const BASE_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "Strict",
  secure: true,
} satisfies CookieOptions;
const REFRESH_COOKIE_OPTIONS = {
  ...BASE_COOKIE_OPTIONS,
  httpOnly: true,
  maxAge: REFRESH_COOKIE_MAX_AGE,
} satisfies CookieOptions;
const SESSION_HINT_COOKIE_OPTIONS = {
  ...BASE_COOKIE_OPTIONS,
  maxAge: REFRESH_COOKIE_MAX_AGE,
} satisfies CookieOptions;

export function getJwtSecret(env: Env): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET);
}

export async function verifyAccessToken(token: string, env: Env): Promise<{ sub: string; jti: string }> {
  const { payload } = await jwtVerify(token, getJwtSecret(env), {
    algorithms: [JWT_ALGORITHM],
  });

  if (!payload.sub || !payload.jti) {
    throw new Error("missing_claims");
  }

  if (payload.type === "refresh") {
    throw new Error("refresh_token_misuse");
  }

  return { sub: payload.sub, jti: payload.jti };
}

export function generateSecureToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createAccessToken(userId: string, env: Env): Promise<string> {
  return new SignJWT({ sub: userId, jti: ulid() })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(getJwtSecret(env));
}

export async function createRefreshToken(userId: string, env: Env): Promise<string> {
  return new SignJWT({ sub: userId, jti: ulid(), type: "refresh" })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecret(env));
}

export function setRefreshCookie(c: Context, token: string): void {
  setCookie(c, REFRESH_COOKIE, token, REFRESH_COOKIE_OPTIONS);
  setCookie(c, SESSION_HINT_COOKIE, "1", SESSION_HINT_COOKIE_OPTIONS);
}

export function clearRefreshCookie(c: Context): void {
  deleteCookie(c, REFRESH_COOKIE, { ...BASE_COOKIE_OPTIONS, httpOnly: true });
  deleteCookie(c, SESSION_HINT_COOKIE, BASE_COOKIE_OPTIONS);
}

export function toUserResponse(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar_url: user.avatar_url,
    created_at: user.created_at,
  };
}
