import { AiErrorCode, parseAiSseStream, type AiUsage } from "@/shared/ai";
import type { AiAskRequest, AiGenerateRequest, AiRewriteRequest, AiSummarizeResponse, ApiError } from "@/shared/types";
import { sendApiRequest } from "@/client/lib/api";

export interface AiStreamChunk {
  text: string;
}

export interface AiStreamFinal {
  usage?: AiUsage;
}

export class AiStreamError extends Error {
  readonly code: AiErrorCode;
  constructor(message: string, code: AiErrorCode) {
    super(message);
    this.name = "AiStreamError";
    this.code = code;
  }
}

function coerceErrorCode(raw: unknown): AiErrorCode {
  if (typeof raw !== "string") return "ai_failed";
  const parsed = AiErrorCode.safeParse(raw);
  return parsed.success ? parsed.data : "ai_failed";
}

function wrapThrownError(err: unknown): AiStreamError {
  if (err instanceof AiStreamError) return err;
  if (typeof err === "object" && err !== null && "message" in err && "error" in err) {
    const payload = err as ApiError;
    return new AiStreamError(payload.message ?? "AI request failed", coerceErrorCode(payload.error));
  }
  const message = err instanceof Error ? err.message : "AI request failed";
  return new AiStreamError(message, "ai_failed");
}

export function streamRewrite(
  workspaceId: string,
  pageId: string,
  body: AiRewriteRequest,
  signal?: AbortSignal,
): AsyncGenerator<AiStreamChunk, AiStreamFinal, void> {
  return streamAiPost(`/workspaces/${workspaceId}/pages/${pageId}/rewrite`, body, signal);
}

export function streamGenerate(
  workspaceId: string,
  pageId: string,
  body: AiGenerateRequest,
  signal?: AbortSignal,
): AsyncGenerator<AiStreamChunk, AiStreamFinal, void> {
  return streamAiPost(`/workspaces/${workspaceId}/pages/${pageId}/generate`, body, signal);
}

export function streamAskPage(
  workspaceId: string,
  pageId: string,
  body: AiAskRequest,
  signal?: AbortSignal,
): AsyncGenerator<AiStreamChunk, AiStreamFinal, void> {
  return streamAiPost(`/workspaces/${workspaceId}/pages/${pageId}/ask`, body, signal);
}

export async function summarizePage(workspaceId: string, pageId: string): Promise<AiSummarizeResponse> {
  try {
    const response = await sendApiRequest(`/workspaces/${workspaceId}/pages/${pageId}/summarize`, { method: "POST" });
    return (await response.json()) as AiSummarizeResponse;
  } catch (err) {
    throw wrapThrownError(err);
  }
}

async function* streamAiPost(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<AiStreamChunk, AiStreamFinal, void> {
  let response: Response;
  try {
    response = await sendApiRequest(path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { accept: "text/event-stream" },
      signal,
    });
  } catch (err) {
    throw wrapThrownError(err);
  }

  if (!response.body) {
    throw new AiStreamError("Empty response body", "ai_failed");
  }

  for await (const frame of parseAiSseStream(response.body)) {
    if (frame.event === "chunk") {
      yield { text: frame.data.text };
      continue;
    }
    if (frame.event === "error") {
      throw new AiStreamError(frame.data.message, frame.data.code ?? "ai_failed");
    }
    if (frame.event === "done") {
      return frame.data.usage ? { usage: frame.data.usage } : {};
    }
  }
  return {};
}
