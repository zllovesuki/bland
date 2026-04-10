import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { users } from "@/worker/db/d1/schema";
import type { Db } from "@/worker/db/d1/client";
import { verifyAccessToken } from "@/worker/lib/auth";
import { createLogger } from "@/worker/lib/logger";

const log = createLogger("auth.middleware");

type AuthVariables = {
  user: typeof users.$inferSelect | null;
  jwtPayload: { sub: string; jti: string } | null;
};

export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  return parts[1];
}

async function verifyAndLoadUser(
  authorization: string | undefined,
  env: Env,
  db: Db,
): Promise<{
  user: typeof users.$inferSelect | null;
  jwtPayload: { sub: string; jti: string } | null;
}> {
  const token = extractBearerToken(authorization);
  if (!token) return { user: null, jwtPayload: null };

  log.debug("verify_token");

  try {
    const { sub, jti } = await verifyAccessToken(token, env);

    const user = await db.select().from(users).where(eq(users.id, sub)).get();

    if (!user) {
      log.debug("token_rejected", { reason: "user_not_found", userId: sub });
      return { user: null, jwtPayload: null };
    }

    log.debug("token_verified", { userId: sub });
    return { user, jwtPayload: { sub, jti } };
  } catch {
    log.debug("token_rejected", { reason: "invalid_jwt" });
    return { user: null, jwtPayload: null };
  }
}

export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables & { db: Db };
}>(async (c, next) => {
  const db = c.get("db");
  const authorization = c.req.header("authorization");
  const { user, jwtPayload } = await verifyAndLoadUser(authorization, c.env, db);

  if (!user || !jwtPayload) {
    return c.json({ error: "unauthorized", message: "Invalid or missing authentication token" }, 401);
  }

  c.set("user", user);
  c.set("jwtPayload", jwtPayload);
  await next();
});

export const optionalAuth = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables & { db: Db };
}>(async (c, next) => {
  const db = c.get("db");
  const authorization = c.req.header("authorization");
  const { user, jwtPayload } = await verifyAndLoadUser(authorization, c.env, db);

  c.set("user", user ?? null);
  c.set("jwtPayload", jwtPayload ?? null);
  await next();
});
