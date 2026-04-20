import { Hono, type Context } from "hono";

import { requireAuth, optionalAuth } from "@/worker/middleware/auth";
import { rateLimit } from "@/worker/middleware/rate-limit";
import { getPage } from "@/worker/lib/page-access";
import { resolvePageAccessLevels, resolvePrincipal } from "@/worker/lib/permissions";
import { parseBody } from "@/worker/lib/validate";
import { errorContext } from "@/worker/lib/logger";
import { createAiClient, AiMisconfiguredError, AiBackendError } from "@/worker/lib/ai";
import type { AiChatMessage, AiClient, AiFrame } from "@/worker/lib/ai";
import { buildAskMessages, buildGenerateMessages, buildRewriteMessages } from "@/worker/lib/ai/prompts";
import {
  aiLogger,
  logAiDenied,
  logAiRequest,
  logAiResponse,
  type AiAction,
  type AiLogContext,
} from "@/worker/lib/ai/logging";
import {
  getPageAiEntitlements,
  type EntitlementSurface,
  type PageAccessLevel,
  type PageAiEntitlements,
} from "@/shared/entitlements";
import { AiAskRequest, AiGenerateRequest, AiRewriteRequest } from "@/shared/types";
import { encodeAiSseChunk, encodeAiSseDone, encodeAiSseError, type AiErrorCode, type AiUsage } from "@/shared/ai";
import type { AppContext } from "@/worker/router";

const log = aiLogger();

const SSE_HEADERS: HeadersInit = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache",
  "x-accel-buffering": "no",
};

const aiRouter = new Hono<AppContext>();

aiRouter.post("/workspaces/:wid/pages/:id/rewrite", requireAuth, rateLimit("RL_AI"), async (c) => {
  const startedAt = Date.now();
  const workspaceId = c.req.param("wid");
  const pageId = c.req.param("id");
  const data = await parseBody(c, AiRewriteRequest);
  if (data instanceof Response) return data;

  const gate = await gateAiAction(c, workspaceId, pageId, "rewrite", (ent) => ent.useAiRewrite);
  if (gate instanceof Response) return gate;

  const logCtx = buildLogContext(c, "rewrite", workspaceId, pageId, gate);
  logAiRequest(logCtx);

  const client = resolveClient(c);
  if (client instanceof Response) return client;

  const messages = buildRewriteMessages(data);
  return streamChat(client, messages, `rewrite:${c.get("user")!.id}:${pageId}`, logCtx, startedAt);
});

aiRouter.post("/workspaces/:wid/pages/:id/generate", requireAuth, rateLimit("RL_AI"), async (c) => {
  const startedAt = Date.now();
  const workspaceId = c.req.param("wid");
  const pageId = c.req.param("id");
  const data = await parseBody(c, AiGenerateRequest);
  if (data instanceof Response) return data;

  const gate = await gateAiAction(c, workspaceId, pageId, "generate", (ent) => ent.useAiGenerate);
  if (gate instanceof Response) return gate;

  const logCtx = buildLogContext(c, "generate", workspaceId, pageId, gate);
  logAiRequest(logCtx);

  const client = resolveClient(c);
  if (client instanceof Response) return client;

  const messages = buildGenerateMessages(data);
  return streamChat(client, messages, `generate:${c.get("user")!.id}:${pageId}`, logCtx, startedAt);
});

aiRouter.post("/workspaces/:wid/pages/:id/summarize", optionalAuth, rateLimit("RL_AI"), async (c) => {
  const startedAt = Date.now();
  const workspaceId = c.req.param("wid");
  const pageId = c.req.param("id");

  const gate = await gateAiAction(c, workspaceId, pageId, "summarize", (ent) => ent.summarizePage);
  if (gate instanceof Response) return gate;

  const logCtx = buildLogContext(c, "summarize", workspaceId, pageId, gate);
  logAiRequest(logCtx);

  const body = await requireNonEmptyBody(c, pageId);
  if (body instanceof Response) {
    logAiResponse(logCtx, startedAt, "error", { errorCode: "page_empty" });
    return body;
  }

  const client = resolveClient(c);
  if (client instanceof Response) {
    logAiResponse(logCtx, startedAt, "error", { errorCode: "ai_misconfigured" });
    return client;
  }

  try {
    const result = await client.summarize(body.bodyText);
    logAiResponse(logCtx, startedAt, "ok", result.usage ? { usage: result.usage } : undefined);
    return c.json(result);
  } catch (err) {
    log.error("summarize_failed", { ...errorContext(err), action: "summarize", pageId, workspaceId });
    const code = err instanceof AiBackendError ? err.code : "ai_failed";
    logAiResponse(logCtx, startedAt, "error", { errorCode: code });
    if (err instanceof AiBackendError) {
      return c.json({ error: err.code, message: err.message }, 502);
    }
    return c.json({ error: "ai_failed", message: "AI summarize failed" }, 502);
  }
});

aiRouter.post("/workspaces/:wid/pages/:id/ask", optionalAuth, rateLimit("RL_AI"), async (c) => {
  const startedAt = Date.now();
  const workspaceId = c.req.param("wid");
  const pageId = c.req.param("id");

  const data = await parseBody(c, AiAskRequest);
  if (data instanceof Response) return data;

  const gate = await gateAiAction(c, workspaceId, pageId, "ask", (ent) => ent.askPage);
  if (gate instanceof Response) return gate;

  const logCtx = buildLogContext(c, "ask", workspaceId, pageId, gate);
  logAiRequest(logCtx);

  const body = await requireNonEmptyBody(c, pageId);
  if (body instanceof Response) {
    logAiResponse(logCtx, startedAt, "error", { errorCode: "page_empty" });
    return body;
  }

  const client = resolveClient(c);
  if (client instanceof Response) {
    logAiResponse(logCtx, startedAt, "error", { errorCode: "ai_misconfigured" });
    return client;
  }

  // Shared surface has no AI entitlements, so reaching this point guarantees an authenticated user.
  const userId = c.get("user")!.id;
  const messages = buildAskMessages(body.title, body.bodyText.slice(0, 6000), data.question, data.history ?? []);
  return streamChat(client, messages, `ask:${userId}:${pageId}`, logCtx, startedAt);
});

export { aiRouter };

async function gateAiAction(
  c: Context<AppContext>,
  workspaceId: string,
  pageId: string,
  action: AiAction,
  select: (ent: PageAiEntitlements) => boolean,
): Promise<{ surface: EntitlementSurface; pageAccess: PageAccessLevel } | Response> {
  const user = c.get("user");
  const db = c.get("db");
  const shareToken = c.req.query("share");

  const resolved = await resolvePrincipal(db, user, workspaceId, shareToken);
  if (!resolved) {
    return c.json({ error: "unauthorized", message: "Authentication required" }, 401);
  }

  const page = await getPage(db, pageId, workspaceId);
  if (!page) {
    return c.json({ error: "not_found", message: "Page not found" }, 404);
  }

  const levels = await resolvePageAccessLevels(db, resolved.principal, [pageId], workspaceId);
  const pageAccess = (levels.get(pageId) ?? "none") as PageAccessLevel;
  if (pageAccess === "none") {
    return c.json({ error: "not_found", message: "Page not found" }, 404);
  }

  const surface: EntitlementSurface = resolved.fullMember ? "canonical" : "shared";
  if (!select(getPageAiEntitlements(surface, pageAccess))) {
    logAiDenied({
      action,
      userId: user?.id,
      workspaceId,
      pageId,
      surface,
      pageAccess,
    });
    return c.json({ error: "ai_not_entitled", message: "AI action not permitted on this page" }, 403);
  }

  return { surface, pageAccess };
}

function buildLogContext(
  c: Context<AppContext>,
  action: AiAction,
  workspaceId: string,
  pageId: string,
  gate: { surface: EntitlementSurface; pageAccess: PageAccessLevel },
): AiLogContext {
  const user = c.get("user");
  return {
    action,
    workspaceId,
    pageId,
    surface: gate.surface,
    pageAccess: gate.pageAccess,
    ...(user ? { userId: user.id } : {}),
  };
}

async function requireNonEmptyBody(
  c: Context<AppContext>,
  pageId: string,
): Promise<{ bodyText: string; title: string } | Response> {
  const payload = await c.env.DocSync.getByName(pageId).getIndexPayload(pageId);
  if (payload.kind === "missing" || payload.bodyText.trim().length === 0) {
    return c.json({ error: "page_empty", message: "Page has no body text yet" }, 404);
  }
  return { bodyText: payload.bodyText, title: payload.title };
}

function resolveClient(c: Context<AppContext>): AiClient | Response {
  try {
    return createAiClient(c.env);
  } catch (err) {
    log.error("ai_client_misconfigured", errorContext(err));
    const message = err instanceof AiMisconfiguredError ? err.message : "AI backend unavailable";
    return c.json({ error: "ai_misconfigured", message }, 503);
  }
}

async function streamChat(
  client: AiClient,
  messages: AiChatMessage[],
  sessionKey: string,
  logCtx: AiLogContext,
  startedAt: number,
): Promise<Response> {
  let iter: AsyncIterable<AiFrame>;
  try {
    iter = await client.chat(messages, { sessionKey });
  } catch (err) {
    log.error("ai_chat_failed", { ...errorContext(err), action: logCtx.action, pageId: logCtx.pageId });
    const code: AiErrorCode = err instanceof AiBackendError ? err.code : "ai_failed";
    const message = err instanceof Error ? err.message : "AI chat failed";
    logAiResponse(logCtx, startedAt, "error", { errorCode: code });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encodeAiSseError(message, code));
        controller.close();
      },
    });
    return new Response(body, { headers: SSE_HEADERS, status: 502 });
  }

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let usage: AiUsage | undefined;
      let errorCode: AiErrorCode | undefined;
      try {
        for await (const frame of iter) {
          if (frame.type === "chunk") {
            controller.enqueue(encodeAiSseChunk(frame.text));
          } else if (frame.type === "usage") {
            usage = frame.usage;
          } else if (frame.type === "error") {
            errorCode = frame.code;
            controller.enqueue(encodeAiSseError(frame.message, frame.code));
          }
        }
        controller.enqueue(encodeAiSseDone(usage));
      } catch (err) {
        log.error("ai_chat_stream_failed", { ...errorContext(err), action: logCtx.action, pageId: logCtx.pageId });
        errorCode = "ai_failed";
        const message = err instanceof Error ? err.message : "AI chat failed";
        controller.enqueue(encodeAiSseError(message, "ai_failed"));
        controller.enqueue(encodeAiSseDone(usage));
      } finally {
        if (errorCode) {
          logAiResponse(logCtx, startedAt, "error", { errorCode });
        } else {
          logAiResponse(logCtx, startedAt, "ok", usage ? { usage } : undefined);
        }
        controller.close();
      }
    },
  });
  return new Response(body, { headers: SSE_HEADERS });
}
