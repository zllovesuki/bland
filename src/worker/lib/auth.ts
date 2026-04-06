import { SignJWT } from "jose";
import { ulid } from "ulidx";
import { argon2id } from "@noble/hashes/argon2.js";
import { randomBytes } from "@noble/hashes/utils.js";
import type { Context } from "hono";

import { users } from "@/worker/db/schema";

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, ".").replace(/\//g, "/").replace(/=+$/, "");
}

function base64Decode(str: string): Uint8Array {
  const padded = str.replace(/\./g, "+") + "==".slice(0, (4 - (str.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const ARGON2_PARAMS = { t: 2, m: 19456, p: 1 } as const;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = argon2id(password, salt, { ...ARGON2_PARAMS, dkLen: 32 });
  const saltB64 = base64Encode(salt);
  const hashB64 = base64Encode(hash);
  return `$argon2id$v=19$m=${ARGON2_PARAMS.m},t=${ARGON2_PARAMS.t},p=${ARGON2_PARAMS.p}$${saltB64}$${hashB64}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  // Format: $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
  if (parts.length !== 6 || parts[1] !== "argon2id") return false;

  const paramStr = parts[3];
  const saltB64 = parts[4];
  const salt = base64Decode(saltB64);

  const params: Record<string, number> = {};
  for (const pair of paramStr.split(",")) {
    const [key, val] = pair.split("=");
    params[key] = parseInt(val, 10);
  }

  const hash = argon2id(password, salt, {
    t: params.t,
    m: params.m,
    p: params.p,
    dkLen: 32,
  });

  const storedHash = base64Decode(parts[5]);

  // Constant-time comparison
  if (hash.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) {
    diff |= hash[i] ^ storedHash[i];
  }
  return diff === 0;
}

export async function createAccessToken(userId: string, env: Env): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  return new SignJWT({ sub: userId, jti: ulid() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secret);
}

export async function createRefreshToken(userId: string, env: Env): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  return new SignJWT({ sub: userId, jti: ulid(), type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export function setRefreshCookie(c: Context, token: string): void {
  c.header("set-cookie", `bland_refresh=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`);
}

export function clearRefreshCookie(c: Context): void {
  c.header("set-cookie", `bland_refresh=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const [name, ...rest] = pair.trim().split("=");
    if (name) cookies[name.trim()] = rest.join("=").trim();
  }
  return cookies;
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
