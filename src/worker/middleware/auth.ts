import { createMiddleware } from "hono/factory";
import { jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { users } from "@/worker/db/schema";
import type { Db } from "@/worker/db/client";

type AuthVariables = {
  user: typeof users.$inferSelect | null;
  jwtPayload: { sub: string; jti: string } | null;
};

function extractBearerToken(header: string | undefined): string | null {
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

  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });

    const sub = payload.sub;
    const jti = payload.jti;
    if (!sub || !jti) return { user: null, jwtPayload: null };

    // Reject refresh tokens used as access tokens
    if (payload.type === "refresh") return { user: null, jwtPayload: null };

    const result = await db.select().from(users).where(eq(users.id, sub)).limit(1);

    if (result.length === 0) return { user: null, jwtPayload: null };

    return { user: result[0], jwtPayload: { sub, jti } };
  } catch {
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
