import { Hono } from "hono";
import { cors } from "hono/cors";
import { ZodError } from "zod";

import { users } from "@/worker/db/schema";
import { createDb, type Db } from "@/worker/db/client";
import { auth } from "@/worker/routes/auth";
import { invitesRouter } from "@/worker/routes/invites";
import { workspacesRouter } from "@/worker/routes/workspaces";
import { pagesRouter } from "@/worker/routes/pages";
import { health } from "@/worker/routes/health";
import { isLocalRequestUrl } from "@/worker/http";
import { D1_BOOKMARK_HEADER } from "@/shared/bookmark";
import { createLogger, errorContext } from "@/worker/lib/logger";
import { ALLOWED_ORIGINS } from "@/worker/lib/constants";

type AppVariables = {
  db: Db;
  user: typeof users.$inferSelect | null;
  jwtPayload: { sub: string; jti: string } | null;
};

export type AppContext = { Bindings: Env; Variables: AppVariables };

const log = createLogger("router");
const app = new Hono<AppContext>();

app.use(
  "*",
  cors({
    origin: ALLOWED_ORIGINS,
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", D1_BOOKMARK_HEADER],
    exposeHeaders: [D1_BOOKMARK_HEADER],
    credentials: true,
    maxAge: 86400,
  }),
);

function selectSessionConstraint(method: string, _path: string): string | undefined {
  // Mutating requests go to primary
  if (method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE") {
    return "first-primary";
  }
  return undefined; // replica OK for GETs without bookmark
}

app.use("*", async (c, next) => {
  const bookmark = c.req.header(D1_BOOKMARK_HEADER)?.trim();
  const constraint = selectSessionConstraint(c.req.method, c.req.path) || bookmark;

  // D1 Sessions API: keep typed session ref for getBookmark() (cf. anvil/db/d1/sessions.ts)
  const session = constraint ? c.env.DB.withSession(constraint) : null;
  const db = createDb((session ?? c.env.DB) as D1Database);
  c.set("db", db);
  c.set("user", null);
  c.set("jwtPayload", null);

  await next();

  // Return the bookmark for client to use on next request
  const latestBookmark = session?.getBookmark() ?? null;
  if (latestBookmark) {
    c.header(D1_BOOKMARK_HEADER, latestBookmark);
  }
});

app.use("*", async (c, next) => {
  await next();

  // Local dev uses 403 here because the current Miniflare/Vite bridge can mis-handle some 401
  // responses and surface them as `fetch failed` overlays instead of returning the JSON body.
  if (!isLocalRequestUrl(c.req.url) || c.res.status !== 401) {
    return;
  }

  c.res = new Response(c.res.body, {
    status: 403,
    statusText: c.res.statusText,
    headers: c.res.headers,
  });
});

app.route("/api/v1", health);
app.route("/api/v1", auth);
app.route("/api/v1", invitesRouter);
app.route("/api/v1", workspacesRouter);
app.route("/api/v1", pagesRouter);

app.notFound((c) => {
  return c.json({ error: "not_found", message: "Route not found" }, 404);
});

app.onError((err, c) => {
  if (err instanceof ZodError) {
    return c.json({ error: "validation_error", message: "Invalid request body", issues: err.issues }, 400);
  }

  log.error("unhandled_error", errorContext(err));
  return c.json({ error: "internal_error", message: "An unexpected error occurred" }, 500);
});

export { app };
