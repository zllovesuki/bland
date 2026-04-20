import { describe, expect, it } from "vitest";
import type { AiUsage } from "@/shared/ai";
import { parseProviderSseFrames, parseProviderTokenUsage } from "@/worker/lib/ai/sse-transform";
import type { AiFrame } from "@/worker/lib/ai/types";

function providerStream(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const f of frames) controller.enqueue(encoder.encode(f));
      controller.close();
    },
  });
}

async function collect(iter: AsyncIterable<AiFrame>): Promise<AiFrame[]> {
  const out: AiFrame[] = [];
  for await (const frame of iter) out.push(frame);
  return out;
}

describe("parseProviderSseFrames — workers-ai shape", () => {
  const extractChunkText = (p: unknown): string | null => {
    if (typeof p !== "object" || p === null) return null;
    const r = (p as { response?: unknown }).response;
    return typeof r === "string" && r.length > 0 ? r : null;
  };
  const extractUsage = (p: unknown): AiUsage | null => {
    if (typeof p !== "object" || p === null) return null;
    return parseProviderTokenUsage((p as { usage?: unknown }).usage);
  };

  it("emits chunks and a usage frame when [DONE] sentinel arrives", async () => {
    const source = providerStream([
      `data: ${JSON.stringify({ response: "Hello" })}\n\n`,
      `data: ${JSON.stringify({ response: " world" })}\n\n`,
      `data: ${JSON.stringify({ response: "", usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 } })}\n\n`,
      `data: [DONE]\n\n`,
    ]);
    const out = await collect(
      parseProviderSseFrames(source, { extractChunkText, extractUsage, errorLabel: "workers-ai" }),
    );
    expect(out).toEqual([
      { type: "chunk", text: "Hello" },
      { type: "chunk", text: " world" },
      { type: "usage", usage: { promptTokens: 12, completionTokens: 3, totalTokens: 15 } },
    ]);
  });

  it("omits a usage frame when the provider doesn't report any", async () => {
    const source = providerStream([`data: ${JSON.stringify({ response: "hi" })}\n\n`, `data: [DONE]\n\n`]);
    const out = await collect(
      parseProviderSseFrames(source, { extractChunkText, extractUsage, errorLabel: "workers-ai" }),
    );
    expect(out).toEqual([{ type: "chunk", text: "hi" }]);
  });

  it("ends cleanly when the source closes without [DONE]", async () => {
    const source = providerStream([`data: ${JSON.stringify({ response: "abc" })}\n\n`]);
    const out = await collect(parseProviderSseFrames(source, { extractChunkText, errorLabel: "workers-ai" }));
    expect(out).toEqual([{ type: "chunk", text: "abc" }]);
  });

  it("ignores malformed JSON payloads", async () => {
    const source = providerStream([
      `data: not json\n\n`,
      `data: ${JSON.stringify({ response: "ok" })}\n\n`,
      `data: [DONE]\n\n`,
    ]);
    const out = await collect(parseProviderSseFrames(source, { extractChunkText, errorLabel: "workers-ai" }));
    expect(out).toEqual([{ type: "chunk", text: "ok" }]);
  });
});

describe("parseProviderSseFrames — openai-compat shape", () => {
  const extractChunkText = (p: unknown): string | null => {
    if (typeof p !== "object" || p === null) return null;
    const choices = (p as { choices?: unknown }).choices;
    if (!Array.isArray(choices) || choices.length === 0) return null;
    const delta = (choices[0] as { delta?: { content?: unknown } } | null)?.delta;
    return typeof delta?.content === "string" && delta.content.length > 0 ? delta.content : null;
  };
  const extractUsage = (p: unknown): AiUsage | null => {
    if (typeof p !== "object" || p === null) return null;
    return parseProviderTokenUsage((p as { usage?: unknown }).usage);
  };

  it("handles include_usage frame (empty choices + usage)", async () => {
    const source = providerStream([
      `data: ${JSON.stringify({ choices: [{ delta: { content: "he" } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: "llo" } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } })}\n\n`,
      `data: [DONE]\n\n`,
    ]);
    const out = await collect(
      parseProviderSseFrames(source, { extractChunkText, extractUsage, errorLabel: "openai-compat" }),
    );
    expect(out).toEqual([
      { type: "chunk", text: "he" },
      { type: "chunk", text: "llo" },
      { type: "usage", usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 } },
    ]);
  });
});

describe("parseProviderTokenUsage", () => {
  it("maps snake_case provider tokens to camelCase", () => {
    expect(parseProviderTokenUsage({ prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 })).toEqual({
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
    });
  });

  it("returns null when no recognized token fields are present", () => {
    expect(parseProviderTokenUsage({})).toBeNull();
    expect(parseProviderTokenUsage(null)).toBeNull();
    expect(parseProviderTokenUsage({ prompt_tokens: "many" })).toBeNull();
  });

  it("partial usage is preserved", () => {
    expect(parseProviderTokenUsage({ total_tokens: 42 })).toEqual({ totalTokens: 42 });
  });
});
