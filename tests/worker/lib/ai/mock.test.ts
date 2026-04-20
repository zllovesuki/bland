import { describe, expect, it } from "vitest";
import { createMockAiClient } from "@/worker/lib/ai/mock";
import type { AiFrame } from "@/worker/lib/ai/types";

async function collectChunks(iter: AsyncIterable<AiFrame>): Promise<string> {
  let buffer = "";
  for await (const frame of iter) {
    if (frame.type === "chunk") buffer += frame.text;
  }
  return buffer;
}

async function collectFrames(iter: AsyncIterable<AiFrame>): Promise<AiFrame[]> {
  const frames: AiFrame[] = [];
  for await (const frame of iter) frames.push(frame);
  return frames;
}

describe("mock AI client", () => {
  it("emits a deterministic [mock-chat] prefix from the last user message", async () => {
    const client = createMockAiClient();
    const iter = await client.chat([
      { role: "system", content: "You are an assistant." },
      { role: "user", content: "Please proofread this sentence." },
    ]);
    const body = await collectChunks(iter);
    expect(body.startsWith("[mock-chat]")).toBe(true);
    expect(body).toContain("Please proofread this sentence.");
  });

  it("summarize returns a deterministic [mock-summary] prefix with usage", async () => {
    const client = createMockAiClient();
    const result = await client.summarize("Launch freeze begins Thursday. Rollout staged by region.");
    expect(result.summary.startsWith("[mock-summary]")).toBe(true);
    expect(result.summary).toContain("Launch freeze begins Thursday.");
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
  });

  it("chat stream emits a usage frame at the end", async () => {
    const client = createMockAiClient();
    const iter = await client.chat([{ role: "user", content: "hi" }]);
    const frames = await collectFrames(iter);
    const usage = frames.find((f): f is Extract<AiFrame, { type: "usage" }> => f.type === "usage");
    expect(usage?.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    expect(frames[frames.length - 1]?.type).toBe("usage");
    expect(frames.filter((f) => f.type === "chunk").length).toBeGreaterThan(0);
  });
});
