import { routePartykitRequest } from "partyserver";
import { eq } from "drizzle-orm";
import { app } from "@/worker/router";
import { createDb } from "@/worker/db/client";
import { pages } from "@/worker/db/schema";
import { checkMembership } from "@/worker/lib/membership";
import { verifyAccessToken } from "@/worker/lib/auth";
import { createLogger, errorContext, setLevel } from "@/worker/lib/logger";
import { ALLOWED_ORIGINS } from "@/worker/lib/constants";
import { handleSearchIndexMessage } from "@/worker/queues/search-indexer";

export { DocSync } from "@/worker/durable-objects/doc-sync";

const log = createLogger("websocket");

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    setLevel(env.LOG_LEVEL);

    // Route WebSocket connections to DocSync Durable Object
    const partyResponse = await routePartykitRequest(request, env, {
      onBeforeConnect: async (req, lobby) => {
        const pageId = lobby.name;
        log.debug("connection_attempt", { pageId });

        // Validate origin
        const origin = req.headers.get("origin");
        if (origin && !ALLOWED_ORIGINS.includes(origin)) {
          log.warn("origin_rejected", { origin, pageId });
          return new Response("Forbidden origin", { status: 403 });
        }

        const url = new URL(req.url);
        const token = url.searchParams.get("token");

        if (!token) {
          log.warn("token_missing", { pageId });
          return new Response("Authentication required", { status: 401 });
        }

        let userId: string;
        try {
          const { sub } = await verifyAccessToken(token, env);
          userId = sub;
        } catch {
          log.warn("auth_failed", { pageId });
          return new Response("Invalid token", { status: 401 });
        }

        // Check that the page exists, is not archived, and user is a workspace member
        const db = createDb(env.DB);
        const page = await db
          .select({ workspace_id: pages.workspace_id, archived_at: pages.archived_at })
          .from(pages)
          .where(eq(pages.id, pageId))
          .get();

        if (!page || page.archived_at) {
          log.warn("page_not_found", { pageId, userId });
          return new Response("Page not found", { status: 404 });
        }

        const membership = await checkMembership(db, userId, page.workspace_id);
        if (!membership) {
          log.warn("access_denied", { userId, pageId, workspaceId: page.workspace_id });
          return new Response("You do not have access to this page", { status: 403 });
        }

        log.info("connection_authorized", { userId, pageId, workspaceId: page.workspace_id });
      },
    });
    if (partyResponse) return partyResponse;

    return app.fetch(request, env, ctx);
  },
  async queue(batch: MessageBatch, env: Env) {
    setLevel(env.LOG_LEVEL);
    const log = createLogger("queue");

    for (const msg of batch.messages) {
      const body = msg.body as { type: string; pageId?: string };
      try {
        if (body.type === "index-page" && body.pageId) {
          await handleSearchIndexMessage({ type: "index-page", pageId: body.pageId }, env);
        } else {
          log.warn("unknown_message_type", { type: body.type });
        }
        msg.ack();
      } catch (e) {
        log.error("message_failed", { type: body.type, pageId: body.pageId, ...errorContext(e) });
        msg.retry();
      }
    }
  },
} satisfies ExportedHandler<Env>;
