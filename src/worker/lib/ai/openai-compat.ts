import type { AiUsage } from "@/shared/ai";
import {
  AiBackendError,
  AiMisconfiguredError,
  type AiChatMessage,
  type AiChatOptions,
  type AiClient,
  type AiFrame,
  type AiSummarizeOptions,
  type AiSummarizeResult,
} from "@/worker/lib/ai/types";
import { parseProviderSseFrames, parseProviderTokenUsage } from "@/worker/lib/ai/sse-transform";

interface OpenAiCompatConfig {
  endpoint: string;
  apiKey: string;
  chatModel: string;
  summarizeModel: string;
}

export function createOpenAiCompatClient(config: OpenAiCompatConfig): AiClient {
  if (!config.endpoint) {
    throw new AiMisconfiguredError("BLAND_AI_OPENAI_ENDPOINT is required when BLAND_AI_MODE=openai-compat");
  }
  const baseUrl = config.endpoint.replace(/\/$/, "");

  return {
    async chat(messages: AiChatMessage[], opts?: AiChatOptions): Promise<AsyncIterable<AiFrame>> {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: chatHeaders(config.apiKey),
        signal: opts?.signal,
        body: JSON.stringify({
          model: config.chatModel,
          messages,
          stream: true,
          stream_options: { include_usage: true },
          // Reasoning-enabled servers (llama.cpp --reasoning on, OpenAI o-series) spend a
          // chunk of this budget on the thinking trace before emitting content, so the
          // default has to comfortably fit reasoning + answer. Callers can override.
          max_tokens: opts?.maxTokens ?? 1024,
          temperature: opts?.temperature ?? 0.7,
        }),
      });

      if (!response.ok || !response.body) {
        await drainAndDiscard(response);
        throw new AiBackendError(`openai-compat chat failed: ${response.status}`, "ai_chat_failed");
      }

      return parseProviderSseFrames(response.body, {
        extractChunkText: extractOpenAiChunk,
        extractUsage: extractOpenAiUsage,
        errorLabel: "openai-compat stream error",
      });
    },

    async summarize(text: string, opts?: AiSummarizeOptions): Promise<AiSummarizeResult> {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: chatHeaders(config.apiKey),
        body: JSON.stringify({
          model: config.summarizeModel,
          stream: false,
          // Same story as chat(): reasoning models need headroom for the trace before the
          // summary is emitted. 768 comfortably fits a 256-token reasoning budget plus
          // a 3–5 sentence summary.
          max_tokens: opts?.maxTokens ?? 768,
          temperature: 0.2,
          messages: [
            { role: "system", content: "Summarize the user's document in 3–5 sentences. Be concise and faithful." },
            { role: "user", content: text },
          ],
        }),
      });

      if (!response.ok) {
        await drainAndDiscard(response);
        throw new AiBackendError(`openai-compat summarize failed: ${response.status}`, "ai_summarize_failed");
      }

      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: unknown;
      };
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.length === 0) {
        throw new AiBackendError("OpenAI-compat summarize returned empty body", "ai_summarize_empty");
      }
      const usage = parseProviderTokenUsage(body.usage);
      return usage ? { summary: content.trim(), usage } : { summary: content.trim() };
    },
  };
}

function chatHeaders(apiKey: string): HeadersInit {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "text/event-stream",
  };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  return headers;
}

// Upstream error bodies can echo prompts, request headers, or provider-internal
// detail. Drain the stream so the connection releases, and discard the content
// without keeping it on any field that could later flow into logs or clients.
async function drainAndDiscard(response: Response): Promise<void> {
  try {
    await response.text();
  } catch {
    // ignore
  }
}

function extractOpenAiChunk(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (typeof first !== "object" || first === null) return null;
  const delta = (first as { delta?: unknown }).delta;
  if (typeof delta !== "object" || delta === null) return null;
  const content = (delta as { content?: unknown }).content;
  return typeof content === "string" && content.length > 0 ? content : null;
}

function extractOpenAiUsage(payload: unknown): AiUsage | null {
  if (typeof payload !== "object" || payload === null) return null;
  const usage = (payload as { usage?: unknown }).usage;
  return parseProviderTokenUsage(usage);
}
