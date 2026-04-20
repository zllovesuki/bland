import { createMockAiClient } from "@/worker/lib/ai/mock";
import { createOpenAiCompatClient } from "@/worker/lib/ai/openai-compat";
import {
  createWorkersAiClient,
  DEFAULT_WORKERS_CHAT_MODEL,
  DEFAULT_WORKERS_SUMMARIZE_MODEL,
} from "@/worker/lib/ai/workers-ai";
import { AiMisconfiguredError, type AiClient, type AiMode } from "@/worker/lib/ai/types";

export function createAiClient(env: Env): AiClient {
  const mode = resolveMode(env.BLAND_AI_MODE);
  switch (mode) {
    case "mock":
      return createMockAiClient();
    case "openai-compat":
      return createOpenAiCompatClient({
        endpoint: env.BLAND_AI_OPENAI_ENDPOINT,
        apiKey: env.BLAND_AI_OPENAI_API_KEY,
        chatModel: env.BLAND_AI_OPENAI_CHAT_MODEL || "llama3",
        summarizeModel: env.BLAND_AI_OPENAI_SUMMARIZE_MODEL || env.BLAND_AI_OPENAI_CHAT_MODEL || "llama3",
      });
    case "workers-ai":
      return createWorkersAiClient(env.AI, {
        chatModel: env.BLAND_AI_WORKERS_CHAT_MODEL || DEFAULT_WORKERS_CHAT_MODEL,
        summarizeModel: env.BLAND_AI_WORKERS_SUMMARIZE_MODEL || DEFAULT_WORKERS_SUMMARIZE_MODEL,
      });
  }
}

function resolveMode(raw: string): AiMode {
  const value = (raw || "").trim().toLowerCase();
  if (value === "mock") return "mock";
  if (value === "openai-compat") return "openai-compat";
  if (value === "workers-ai" || value === "") return "workers-ai";
  throw new AiMisconfiguredError(`Unknown BLAND_AI_MODE: ${raw}`);
}

export { AiMisconfiguredError, AiBackendError } from "@/worker/lib/ai/types";
export type {
  AiClient,
  AiChatMessage,
  AiChatOptions,
  AiFrame,
  AiSummarizeOptions,
  AiSummarizeResult,
  AiMode,
} from "@/worker/lib/ai/types";
