import { z } from "zod";

export const AiUsage = z.object({
  promptTokens: z.number().optional(),
  completionTokens: z.number().optional(),
  totalTokens: z.number().optional(),
});
export type AiUsage = z.infer<typeof AiUsage>;

export const AiErrorCode = z.enum([
  "ai_misconfigured",
  "ai_not_entitled",
  "ai_chat_failed",
  "ai_chat_no_stream",
  "ai_summarize_failed",
  "ai_summarize_empty",
  "ai_backend_failed",
  "ai_failed",
  "page_empty",
  "rate_limited",
  "unauthorized",
  "not_found",
  "request_failed",
  "validation_error",
]);
export type AiErrorCode = z.infer<typeof AiErrorCode>;

export type AiSseFrame =
  | { event: "chunk"; data: { text: string } }
  | { event: "done"; data: { usage?: AiUsage } }
  | { event: "error"; data: { message: string; code?: AiErrorCode } };

export function encodeAiSseFrame(frame: AiSseFrame): string {
  return `event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`;
}

export function encodeAiSseChunk(text: string): Uint8Array {
  return new TextEncoder().encode(encodeAiSseFrame({ event: "chunk", data: { text } }));
}

export function encodeAiSseDone(usage?: AiUsage): Uint8Array {
  const data = usage ? { usage } : {};
  return new TextEncoder().encode(encodeAiSseFrame({ event: "done", data }));
}

export function encodeAiSseError(message: string, code?: AiErrorCode): Uint8Array {
  return new TextEncoder().encode(encodeAiSseFrame({ event: "error", data: { message, code } }));
}

export async function* parseAiSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<AiSseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let delimiterIndex = buffer.indexOf("\n\n");
      while (delimiterIndex !== -1) {
        const rawFrame = buffer.slice(0, delimiterIndex);
        buffer = buffer.slice(delimiterIndex + 2);
        const parsed = parseFrame(rawFrame);
        if (parsed) yield parsed;
        delimiterIndex = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseFrame(raw: string): AiSseFrame | null {
  let event: string | null = null;
  let data: string | null = null;
  for (const line of raw.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice(7).trim();
    else if (line.startsWith("data: ")) data = line.slice(6);
  }
  if (!event || !data) return null;
  let parsedData: unknown;
  try {
    parsedData = JSON.parse(data);
  } catch {
    return null;
  }
  if (event === "chunk" && isChunkData(parsedData)) return { event: "chunk", data: parsedData };
  if (event === "done") return { event: "done", data: parseDoneData(parsedData) };
  if (event === "error" && isErrorData(parsedData)) return { event: "error", data: parsedData };
  return null;
}

function isChunkData(value: unknown): value is { text: string } {
  return typeof value === "object" && value !== null && typeof (value as { text?: unknown }).text === "string";
}

function isErrorData(value: unknown): value is { message: string; code?: AiErrorCode } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { message?: unknown; code?: unknown };
  if (typeof v.message !== "string") return false;
  if (v.code === undefined) return true;
  return typeof v.code === "string" && AiErrorCode.safeParse(v.code).success;
}

function parseDoneData(value: unknown): { usage?: AiUsage } {
  if (typeof value !== "object" || value === null) return {};
  const usage = (value as { usage?: unknown }).usage;
  if (typeof usage !== "object" || usage === null) return {};
  const u = usage as { promptTokens?: unknown; completionTokens?: unknown; totalTokens?: unknown };
  const parsed: AiUsage = {};
  if (typeof u.promptTokens === "number") parsed.promptTokens = u.promptTokens;
  if (typeof u.completionTokens === "number") parsed.completionTokens = u.completionTokens;
  if (typeof u.totalTokens === "number") parsed.totalTokens = u.totalTokens;
  return Object.keys(parsed).length > 0 ? { usage: parsed } : {};
}
