import type { AiUsage } from "@/shared/ai";
import type { AiFrame } from "@/worker/lib/ai/types";

export interface ProviderSseOptions {
  extractChunkText: (payload: unknown) => string | null;
  extractUsage?: (payload: unknown) => AiUsage | null;
  errorLabel: string;
  /** Fires for every parsed payload (before extraction). Used for debug shape sampling. */
  onPayload?: (payload: unknown, index: number) => void;
}

export async function* parseProviderSseFrames(
  source: ReadableStream<Uint8Array>,
  opts: ProviderSseOptions,
): AsyncGenerator<AiFrame> {
  const decoder = new TextDecoder();
  let buffer = "";
  let usage: AiUsage | undefined;
  let payloadIndex = 0;
  const reader = source.getReader();

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let delimiterIndex = buffer.indexOf("\n\n");
      while (delimiterIndex !== -1) {
        const frame = buffer.slice(0, delimiterIndex);
        buffer = buffer.slice(delimiterIndex + 2);
        const raw = extractDataField(frame);
        if (raw !== null) {
          if (raw === "[DONE]") {
            if (usage) yield { type: "usage", usage };
            return;
          }
          const parsed = safeJsonParse(raw);
          if (parsed !== undefined) {
            opts.onPayload?.(parsed, payloadIndex++);
            if (opts.extractUsage) {
              const captured = opts.extractUsage(parsed);
              if (captured) usage = captured;
            }
            const text = opts.extractChunkText(parsed);
            if (text) yield { type: "chunk", text };
          }
        }
        delimiterIndex = buffer.indexOf("\n\n");
      }
    }
    if (usage) yield { type: "usage", usage };
  } catch (err) {
    const message = err instanceof Error ? err.message : opts.errorLabel;
    yield { type: "error", message, code: "ai_chat_failed" };
  } finally {
    reader.releaseLock();
  }
}

export function parseProviderTokenUsage(raw: unknown): AiUsage | null {
  if (typeof raw !== "object" || raw === null) return null;
  const u = raw as { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
  const usage: AiUsage = {};
  if (typeof u.prompt_tokens === "number") usage.promptTokens = u.prompt_tokens;
  if (typeof u.completion_tokens === "number") usage.completionTokens = u.completion_tokens;
  if (typeof u.total_tokens === "number") usage.totalTokens = u.total_tokens;
  return Object.keys(usage).length > 0 ? usage : null;
}

function extractDataField(frame: string): string | null {
  for (const line of frame.split("\n")) {
    if (line.startsWith("data: ")) return line.slice(6).trim();
  }
  return null;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
