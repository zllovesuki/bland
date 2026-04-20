import type { AiUsage } from "@/shared/ai";
import {
  AiBackendError,
  type AiChatMessage,
  type AiChatOptions,
  type AiClient,
  type AiFrame,
  type AiSummarizeOptions,
  type AiSummarizeResult,
} from "@/worker/lib/ai/types";
import { parseProviderSseFrames, parseProviderTokenUsage } from "@/worker/lib/ai/sse-transform";
import { aiLogger } from "@/worker/lib/ai/logging";

const log = aiLogger();
const DEBUG_SAMPLE_LIMIT = 3;

export const DEFAULT_WORKERS_CHAT_MODEL = "@cf/google/gemma-4-26b-a4b-it";
export const DEFAULT_WORKERS_SUMMARIZE_MODEL = "@cf/google/gemma-4-26b-a4b-it";

export interface WorkersAiConfig {
  chatModel: string;
  summarizeModel: string;
}

export function createWorkersAiClient(ai: Ai, config: WorkersAiConfig): AiClient {
  return {
    async chat(messages: AiChatMessage[], opts?: AiChatOptions): Promise<AsyncIterable<AiFrame>> {
      const runOpts: AiOptions | undefined = opts?.sessionKey
        ? { extraHeaders: { "x-session-affinity": opts.sessionKey } }
        : undefined;
      const result = await ai.run(
        config.chatModel,
        {
          messages,
          stream: true,
          ...tokenBudget(config.chatModel, opts?.maxTokens ?? 1024),
          temperature: opts?.temperature ?? 0.7,
          ...thinkingOverride(config.chatModel),
        },
        runOpts,
      );

      if (!(result instanceof ReadableStream)) {
        throw new AiBackendError("Workers AI did not return a stream for chat", "ai_chat_no_stream");
      }
      return instrumentedWorkersStream(result as ReadableStream<Uint8Array>, config.chatModel);
    },

    async summarize(text: string, _opts?: AiSummarizeOptions): Promise<AiSummarizeResult> {
      return isDedicatedSummarizer(config.summarizeModel)
        ? runDedicatedSummarize(ai, config.summarizeModel, text)
        : runChatSummarize(ai, config.summarizeModel, text);
    },
  };
}

// ---- Model quirks ----

// Models bound to Cloudflare's `ChatCompletionsInput` schema in
// `worker-configuration.d.ts` — these four are the only ones that accept the
// full OpenAI-compat option set (`max_completion_tokens`, `reasoning_effort`,
// `chat_template_kwargs`, …). Every other Workers AI chat/instruct model uses
// a bespoke per-model input type with only the legacy `max_tokens` field and
// ignores the modern knobs.
//
// When Cloudflare migrates more models onto `ChatCompletionsInput` (new
// bindings near `worker-configuration.d.ts:9409-9423`), add them here.
const OPENAI_COMPAT_SCHEMA_MODELS = new Set<string>([
  "@cf/google/gemma-4-26b-a4b-it",
  "@cf/zai-org/glm-4.7-flash",
  "@cf/moonshotai/kimi-k2.5",
  "@cf/nvidia/nemotron-3-120b-a12b",
]);

// bart-large-cnn and siblings take { input_text } and return { summary }; all
// chat/instruct models take { messages } and return chat-completion shape.
// Match the narrow set that needs the legacy summarization path.
function isDedicatedSummarizer(model: string): boolean {
  return model.includes("/bart-");
}

// `chat_template_kwargs.enable_thinking: false` suppresses the <think> block on
// the four OpenAI-compat-schema reasoning models. Bespoke-schema reasoning
// models (Qwen 3, QwQ, DeepSeek R1 distill, GPT-OSS) don't expose the kwarg —
// they'd either ignore it or error, so we skip it.
function thinkingOverride(model: string): { chat_template_kwargs?: ChatTemplateKwargs } {
  return OPENAI_COMPAT_SCHEMA_MODELS.has(model) ? { chat_template_kwargs: { enable_thinking: false } } : {};
}

// Workers AI models disagree on the token-budget field name. The
// ChatCompletionsInput models (Gemma 4, GLM, Kimi, Nemotron) honor
// `max_completion_tokens`; every other model uses the legacy per-model schema
// and honors `max_tokens`. Sending the wrong field is silently ignored, so the
// model runs to its server-side default — we want explicit control.
function tokenBudget(model: string, budget: number): { max_tokens: number } | { max_completion_tokens: number } {
  return OPENAI_COMPAT_SCHEMA_MODELS.has(model) ? { max_completion_tokens: budget } : { max_tokens: budget };
}

// ---- Summarize paths ----

async function runDedicatedSummarize(ai: Ai, model: string, text: string): Promise<AiSummarizeResult> {
  const result = (await ai.run(model, { input_text: text })) as AiSummarizationOutput;
  const summary = typeof result.summary === "string" ? result.summary.trim() : "";
  if (!summary) {
    throw new AiBackendError("Workers AI summarize returned empty summary", "ai_summarize_empty");
  }
  const usage = parseProviderTokenUsage(result.usage);
  return usage ? { summary, usage } : { summary };
}

async function runChatSummarize(ai: Ai, model: string, text: string): Promise<AiSummarizeResult> {
  const result = await ai.run(model, {
    messages: [
      { role: "system", content: "Summarize the user's document in 3–5 sentences. Be concise and faithful." },
      { role: "user", content: text },
    ],
    ...tokenBudget(model, 768),
    temperature: 0.2,
    ...thinkingOverride(model),
  });
  const summary = extractMessageContent(result);
  if (!summary) {
    throw new AiBackendError(
      `Workers AI summarize returned empty summary (shape: ${describeShape(result)})`,
      "ai_summarize_empty",
    );
  }
  const usage = parseProviderTokenUsage((result as { usage?: unknown } | null)?.usage);
  return usage ? { summary, usage } : { summary };
}

// ---- Stream instrumentation (debug canary) ----

// Logs the first few payload shapes plus a summary line once the stream ends.
// Useful when swapping models — reasoning frames on an instruct-only model, or
// unexpected payload shape, both surface here at debug level.
async function* instrumentedWorkersStream(source: ReadableStream<Uint8Array>, model: string): AsyncGenerator<AiFrame> {
  let chunks = 0;
  let sampled = 0;
  let reasoningFrames = 0;

  const frames = parseProviderSseFrames(source, {
    extractChunkText,
    extractUsage,
    errorLabel: "workers-ai stream error",
    onPayload: (payload, index) => {
      if (hasReasoningDelta(payload)) reasoningFrames++;
      if (index < DEBUG_SAMPLE_LIMIT) {
        sampled++;
        log.debug("ai_stream_sample", { model, index, shape: describeShape(payload) });
      }
    },
  });

  for await (const frame of frames) {
    if (frame.type === "chunk") chunks++;
    yield frame;
  }
  log.debug("ai_stream_summary", { model, sampled, chunks, reasoningFrames });
}

// ---- Shape-aware extractors (streaming + non-streaming) ----

// Stream frames come in two shapes: legacy `{response: "…"}` (Llama, Mistral)
// and OpenAI-compat `{choices: [{delta: {content: "…"}}]}` (Gemma, Qwen 3,
// Scout, …). Try both.
function extractChunkText(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const legacy = (payload as AiTextGenerationOutput).response;
  if (typeof legacy === "string" && legacy.length > 0) return legacy;
  const completion = payload as { choices?: Array<{ delta?: { content?: unknown } }> };
  const content = completion.choices?.[0]?.delta?.content;
  return typeof content === "string" && content.length > 0 ? content : null;
}

function extractUsage(payload: unknown): AiUsage | null {
  if (typeof payload !== "object" || payload === null) return null;
  return parseProviderTokenUsage((payload as { usage?: unknown }).usage);
}

// Non-streaming chat response: `{choices: [{message: {content}}]}` (Gemma,
// Scout) or legacy `{response}` (older Llama/Mistral). Trim on the way out.
function extractMessageContent(result: unknown): string {
  if (typeof result !== "object" || result === null) return "";
  const legacy = (result as AiTextGenerationOutput).response;
  if (typeof legacy === "string" && legacy.trim().length > 0) return legacy.trim();
  const completion = result as Partial<ChatCompletionsOutput>;
  const content = completion.choices?.[0]?.message?.content;
  return typeof content === "string" && content.trim().length > 0 ? content.trim() : "";
}

function hasReasoningDelta(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  const delta = (payload as { choices?: Array<{ delta?: Record<string, unknown> }> }).choices?.[0]?.delta;
  if (!delta) return false;
  return typeof delta.reasoning === "string" || typeof delta.reasoning_content === "string";
}

// Structural fingerprint used in debug logs and error messages. Leaks no content,
// just the keys at each relevant nesting level so we can diagnose shape drift.
function describeShape(value: unknown): string {
  if (value === null || typeof value !== "object") return typeof value;
  const top = Object.keys(value).sort();
  const choices = (value as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return `top=[${top.join(",")}]`;

  const first = choices[0] as Record<string, unknown> | null;
  const choiceKeys = first ? Object.keys(first).sort() : [];
  const deltaKeys =
    first && typeof first.delta === "object" && first.delta !== null ? Object.keys(first.delta).sort() : null;
  const messageKeys =
    first && typeof first.message === "object" && first.message !== null ? Object.keys(first.message).sort() : null;
  return `top=[${top.join(",")}] choices[0]=[${choiceKeys.join(",")}]${
    deltaKeys ? ` delta=[${deltaKeys.join(",")}]` : ""
  }${messageKeys ? ` message=[${messageKeys.join(",")}]` : ""}`;
}

// `@cf/facebook/bart-large-cnn` returns `{ summary }` instead of the chat-completion
// shape; Workers AI's generated `AiSummarizationOutput` type is named but it isn't
// exported as a value, so we redeclare the minimum surface we read.
interface AiSummarizationOutput {
  summary?: string;
  usage?: unknown;
}
