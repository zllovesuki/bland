import { routePartykitRequest } from "partyserver";
import { eq } from "drizzle-orm";
import { app } from "@/worker/router";
import { createDb } from "@/worker/db/d1/client";
import { pages, users } from "@/worker/db/d1/schema";
import { handleHttpRequest } from "@/worker/lib/http-entry";
import { isWriterRole, resolvePageAccessLevels, resolvePrincipal } from "@/worker/lib/permissions";
import { verifyAccessToken } from "@/worker/lib/auth";
import { createLogger, errorContext, setLevel } from "@/worker/lib/logger";
import { isAllowedOrigin } from "@/worker/lib/origins";
import { applyBaselineSecurityHeaders } from "@/worker/lib/security-headers";
import { renderSpaShell } from "@/worker/lib/spa-shell";
import { handleSearchIndexMessage } from "@/worker/queues/search-indexer";

export { DocSync } from "@/worker/durable-objects/doc-sync";
export { WorkspaceIndexer } from "@/worker/durable-objects/workspace-indexer";

const log = createLogger("websocket");

async function handlePartyRequest(request: Request, env: Env) {
  const response = await routePartykitRequest(request, env, {
    onBeforeConnect: async (req, lobby) => {
      const pageId = lobby.name;
      log.debug("connection_attempt", { pageId });

      // Validate browser-provided origins before upgrading the socket.
      const origin = req.headers.get("origin");
      if (origin && !isAllowedOrigin(origin, env)) {
        log.warn("origin_rejected", { origin, pageId });
        return new Response("Forbidden origin", { status: 403 });
      }

      const url = new URL(req.url);
      const token = url.searchParams.get("token");
      const shareToken = url.searchParams.get("share");

      if (!token && !shareToken) {
        log.warn("auth_missing", { pageId });
        return new Response("Authentication required", { status: 401 });
      }

      const db = createDb(env.DB);

      // Load page first — needed for both auth paths
      const page = await db
        .select({ workspace_id: pages.workspace_id, archived_at: pages.archived_at })
        .from(pages)
        .where(eq(pages.id, pageId))
        .get();

      if (!page || page.archived_at) {
        log.warn("page_not_found", { pageId });
        return new Response("Page not found", { status: 404 });
      }

      // Resolve viewer identity. JWT is optional; share-token is authoritative for
      // shared-surface connections so `/s/:token` stays link-scoped even when the
      // browser also carries a bearer (mirrors HTTP shared-follow-on routes).
      let authedUser: { id: string } | null = null;
      if (token) {
        try {
          const { sub } = await verifyAccessToken(token, env);
          const row = await db.select({ id: users.id }).from(users).where(eq(users.id, sub)).get();
          if (!row) {
            log.warn("auth_failed", { pageId, reason: "user_not_found" });
            return new Response("Invalid token", { status: 401 });
          }
          authedUser = { id: row.id };
        } catch {
          log.warn("auth_failed", { pageId });
          return new Response("Invalid token", { status: 401 });
        }
      }

      const surface = shareToken ? "shared" : "canonical";
      const resolved = await resolvePrincipal(db, authedUser, page.workspace_id, {
        surface,
        shareToken: shareToken ?? undefined,
      });
      if (!resolved) {
        log.warn("auth_missing", { pageId, reason: "principal_unresolved" });
        return new Response("Authentication required", { status: 401 });
      }

      const accessLevels = await resolvePageAccessLevels(db, resolved.principal, [pageId], page.workspace_id);
      const accessLevel = accessLevels.get(pageId) ?? "none";
      if (accessLevel === "none") {
        log.warn("access_denied", { pageId, surface, principalType: resolved.principal.type });
        return new Response(
          surface === "shared" ? "Invalid or expired share link" : "You do not have access to this page",
          { status: 403 },
        );
      }
      const readOnly = accessLevel !== "edit";

      log.info("connection_authorized", { pageId, surface, principalType: resolved.principal.type, readOnly });

      // Always return a sanitized Request to prevent client-injected params. The
      // `member_edit` tag is reserved for canonical writers (owner/admin/member) so
      // the DO can hand out edit headroom only to those connections. Guests reach
      // pages via share grants, not the writer fast path, so they do not qualify.
      url.searchParams.delete("readOnly");
      url.searchParams.delete("authType");
      if (readOnly) {
        url.searchParams.set("readOnly", "1");
      }
      if (surface === "canonical" && !readOnly && isWriterRole(resolved.workspaceRole)) {
        url.searchParams.set("authType", "member_edit");
      }
      return new Request(url.toString(), req);
    },
  });

  return response && response.status !== 101 ? applyBaselineSecurityHeaders(response) : response;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    setLevel(env.LOG_LEVEL);
    return handleHttpRequest(request, env, ctx, {
      handlePartyRequest,
      handleAppRequest: (nextRequest, nextEnv, nextCtx) => app.fetch(nextRequest, nextEnv, nextCtx),
      handleAssetRequest: async (nextRequest, nextEnv) =>
        applyBaselineSecurityHeaders(await nextEnv.ASSETS.fetch(nextRequest)),
      handleShellRequest: renderSpaShell,
    });
  },
  async queue(batch: MessageBatch, env: Env) {
    setLevel(env.LOG_LEVEL);
    const log = createLogger("queue");

    for (const msg of batch.messages) {
      const body = msg.body as { type: string; pageId?: string };
      try {
        if (body.type === "index-page" && body.pageId) {
          const result = await handleSearchIndexMessage({ type: "index-page", pageId: body.pageId }, env);
          if (result.kind === "retry") {
            msg.retry({ delaySeconds: result.delaySeconds });
            continue;
          }
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
