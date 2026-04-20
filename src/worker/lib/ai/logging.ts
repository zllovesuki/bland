import { AiErrorCode, type AiUsage } from "@/shared/ai";
import type { EntitlementSurface, PageAccessLevel } from "@/shared/entitlements";
import { createLogger, type Logger } from "@/worker/lib/logger";

export type AiAction = "rewrite" | "generate" | "summarize" | "ask";

export interface AiLogContext {
  action: AiAction;
  userId?: string;
  workspaceId: string;
  pageId: string;
  surface: EntitlementSurface;
  pageAccess: PageAccessLevel;
}

export interface AiDenialContext {
  action: AiAction;
  userId?: string;
  workspaceId: string;
  pageId: string;
  surface: EntitlementSurface;
  pageAccess: PageAccessLevel;
}

const log: Logger = createLogger("ai");

export function aiLogger(): Logger {
  return log;
}

export function logAiRequest(ctx: AiLogContext): void {
  log.info("ai_request", { ...ctx });
}

export function logAiResponse(
  ctx: AiLogContext,
  startedAt: number,
  outcome: "ok" | "error",
  extra?: { usage?: AiUsage; errorCode?: AiErrorCode },
): void {
  log.info("ai_response", {
    ...ctx,
    durationMs: Date.now() - startedAt,
    outcome,
    ...(extra?.usage ? { usage: extra.usage } : {}),
    ...(extra?.errorCode ? { errorCode: extra.errorCode } : {}),
  });
}

export function logAiDenied(ctx: AiDenialContext): void {
  log.warn("ai_denied", { ...ctx });
}
