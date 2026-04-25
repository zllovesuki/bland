import { env } from "cloudflare:workers";
import { createAccessToken, createRefreshToken, REFRESH_COOKIE } from "@/worker/lib/auth";

export async function bearerFor(userId: string): Promise<string> {
  const token = await createAccessToken(userId, env);
  return `Bearer ${token}`;
}

export async function refreshCookieFor(userId: string): Promise<string> {
  const token = await createRefreshToken(userId, env);
  return `${REFRESH_COOKIE}=${token}`;
}
