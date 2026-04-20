import { describe, expect, it } from "vitest";
import { encodeAiSseChunk, encodeAiSseDone, encodeAiSseError, parseAiSseStream, type AiSseFrame } from "@/shared/ai";

function streamFromBytes(bytes: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const b of bytes) controller.enqueue(b);
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<AiSseFrame[]> {
  const frames: AiSseFrame[] = [];
  for await (const frame of parseAiSseStream(stream)) {
    frames.push(frame);
  }
  return frames;
}

describe("ai sse envelope", () => {
  it("round-trips chunk + done frames", async () => {
    const stream = streamFromBytes([encodeAiSseChunk("Hello"), encodeAiSseChunk(" world"), encodeAiSseDone()]);
    const frames = await collect(stream);
    expect(frames).toEqual([
      { event: "chunk", data: { text: "Hello" } },
      { event: "chunk", data: { text: " world" } },
      { event: "done", data: {} },
    ]);
  });

  it("parses error frames with and without code", async () => {
    const stream = streamFromBytes([encodeAiSseError("something broke", "ai_chat_failed")]);
    const [frame] = await collect(stream);
    expect(frame).toEqual({ event: "error", data: { message: "something broke", code: "ai_chat_failed" } });
  });

  it("round-trips done frame with usage payload", async () => {
    const stream = streamFromBytes([
      encodeAiSseChunk("hi"),
      encodeAiSseDone({ promptTokens: 42, completionTokens: 17, totalTokens: 59 }),
    ]);
    const frames = await collect(stream);
    expect(frames).toEqual([
      { event: "chunk", data: { text: "hi" } },
      { event: "done", data: { usage: { promptTokens: 42, completionTokens: 17, totalTokens: 59 } } },
    ]);
  });

  it("ignores malformed usage in done frames", async () => {
    const malformed = new TextEncoder().encode(
      `event: done\ndata: ${JSON.stringify({ usage: { promptTokens: "lots" } })}\n\n`,
    );
    const stream = streamFromBytes([malformed]);
    const [frame] = await collect(stream);
    expect(frame).toEqual({ event: "done", data: {} });
  });

  it("handles split chunks that cross frame boundaries", async () => {
    const full =
      new TextDecoder().decode(encodeAiSseChunk("Alpha")) +
      new TextDecoder().decode(encodeAiSseChunk("Beta")) +
      new TextDecoder().decode(encodeAiSseDone());
    const encoder = new TextEncoder();
    const mid = Math.floor(full.length / 2);
    const stream = streamFromBytes([encoder.encode(full.slice(0, mid)), encoder.encode(full.slice(mid))]);
    const frames = await collect(stream);
    expect(frames.map((f) => f.event)).toEqual(["chunk", "chunk", "done"]);
    expect(frames[0]).toEqual({ event: "chunk", data: { text: "Alpha" } });
  });
});
