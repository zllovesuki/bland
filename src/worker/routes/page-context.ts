import { Hono } from "hono";
import { eq } from "drizzle-orm";

import { workspaces } from "@/worker/db/d1/schema";
import { requireAuth } from "@/worker/middleware/auth";
import { rateLimit } from "@/worker/middleware/rate-limit";
import { checkMembership } from "@/worker/lib/membership";
import { canEdit, resolvePageAccessLevels } from "@/worker/lib/permissions";
import { getPage } from "@/worker/lib/page-access";
import type { AppContext } from "@/worker/router";

const pageContextRouter = new Hono<AppContext>();

// GET /pages/:id/context - Bootstrap page access for non-members
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

  const membership = await checkMembership(db, user.id, workspace.id);

  if (membership && canEdit(membership.role)) {
    return c.json({ workspace, page, access_mode: "member", can_edit: true });
  }

  // Guest or non-member: resolve via page-level shares
  const accessLevels = await resolvePageAccessLevels(db, { type: "user", userId: user.id }, [pageId], workspace.id);
  const level = accessLevels.get(pageId) ?? "none";

  if (level === "none") {
    return c.json({ error: "forbidden", message: "You do not have access to this page" }, 403);
  }

  const accessMode = membership ? "member" : "shared";
  return c.json({ workspace, page, access_mode: accessMode, can_edit: level === "edit" });
});

export { pageContextRouter };
