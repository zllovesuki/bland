import type { AiErrorCode, AiUsage } from "@/shared/ai";

export type AiChatRole = "system" | "user" | "assistant";

export interface AiChatMessage {
  role: AiChatRole;
  content: string;
}

export interface AiChatOptions {
  maxTokens?: number;
  temperature?: number;
  sessionKey?: string;
  signal?: AbortSignal;
}

export interface AiSummarizeOptions {
  maxTokens?: number;
}

export interface AiSummarizeResult {
  summary: string;
  usage?: AiUsage;
}

export type AiFrame =
  | { type: "chunk"; text: string }
  | { type: "usage"; usage: AiUsage }
  | { type: "error"; message: string; code: AiErrorCode };

export interface AiClient {
  chat(messages: AiChatMessage[], opts?: AiChatOptions): Promise<AsyncIterable<AiFrame>>;
  summarize(text: string, opts?: AiSummarizeOptions): Promise<AiSummarizeResult>;
}

export type AiMode = "workers-ai" | "openai-compat" | "mock";

export class AiMisconfiguredError extends Error {
  readonly code: AiErrorCode = "ai_misconfigured";
  constructor(message: string) {
    super(message);
    this.name = "AiMisconfiguredError";
  }
}

export class AiBackendError extends Error {
  readonly code: AiErrorCode;
  constructor(message: string, code: AiErrorCode = "ai_backend_failed") {
    super(message);
    this.name = "AiBackendError";
    this.code = code;
  }
}
