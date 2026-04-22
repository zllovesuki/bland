import { Hono } from "hono";
import { eq } from "drizzle-orm";

import type { AppContext } from "@/worker/app-context";
import { workspaces } from "@/worker/db/d1/schema";
import { requireAuth } from "@/worker/middleware/auth";
import { rateLimit } from "@/worker/middleware/rate-limit";
import { resolvePageAccessLevels, resolvePrincipal, toResolvedViewerContext } from "@/worker/lib/permissions";
import { getPage } from "@/worker/lib/page-access";

const pageContextRouter = new Hono<AppContext>();

// GET /pages/:id/context - Bootstrap canonical page-route workspace identity
pageContextRouter.get("/pages/:id/context", requireAuth, rateLimit("RL_API"), async (c) => {
  const pageId = c.req.param("id");
  const user = c.get("user")!;
  const db = c.get("db");

  const page = await getPage(db, pageId);
  if (!page) {
    return c.json({ error: "not_found", message: "Page not found" }, 404);
  }

  const workspace = await db.select().from(workspaces).where(eq(workspaces.id, page.workspace_id)).get();
  if (!workspace) {
    return c.json({ error: "not_found", message: "Workspace not found" }, 404);
  }

  const resolved = await resolvePrincipal(db, user, workspace.id, { surface: "canonical" });
  if (!resolved) {
    return c.json({ error: "unauthorized", message: "Authentication required" }, 401);
  }

  const accessLevels = await resolvePageAccessLevels(db, resolved.principal, [pageId], workspace.id);
  const level = accessLevels.get(pageId) ?? "none";

  if (level === "none") {
    return c.json({ error: "forbidden", message: "You do not have access to this page" }, 403);
  }

  return c.json({
    workspace,
    viewer: toResolvedViewerContext(resolved, workspace.slug, "canonical"),
  });
});

export { pageContextRouter };
