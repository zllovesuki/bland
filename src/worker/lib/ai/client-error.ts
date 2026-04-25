import type { AiErrorCode } from "@/shared/ai";
import { AiBackendError, AiMisconfiguredError } from "@/worker/lib/ai/types";

const SAFE_MESSAGES: Record<AiErrorCode, string> = {
  ai_misconfigured: "AI backend unavailable",
  ai_not_entitled: "AI action not permitted on this page",
  ai_chat_failed: "Upstream AI service failed",
  ai_chat_no_stream: "Upstream AI service did not return a stream",
  ai_summarize_failed: "Upstream AI service failed",
  ai_summarize_empty: "Upstream AI service returned an empty response",
  ai_backend_failed: "Upstream AI service failed",
  ai_failed: "AI request failed",
  page_empty: "Page has no body text yet",
  rate_limited: "Rate limit exceeded",
  unauthorized: "Authentication required",
  not_found: "Not found",
  request_failed: "AI request failed",
  validation_error: "Invalid request",
};

// Routes must use this when sending error text to clients. Raw upstream bodies
// can include prompts or provider details, so they never leave the worker
// boundary; only a fixed code-keyed string does. `errorContext(err)` continues
// to capture whatever the underlying Error carries for server logs.
export function clientAiErrorMessage(err: unknown): { code: AiErrorCode; message: string } {
  const code = aiErrorCode(err);
  return { code, message: SAFE_MESSAGES[code] ?? SAFE_MESSAGES.ai_failed };
}

function aiErrorCode(err: unknown): AiErrorCode {
  if (err instanceof AiBackendError) return err.code;
  if (err instanceof AiMisconfiguredError) return err.code;
  return "ai_failed";
}
