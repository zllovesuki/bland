import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenAiCompatClient } from "@/worker/lib/ai/openai-compat";
import { AiMisconfiguredError, type AiFrame } from "@/worker/lib/ai/types";

function sseBody(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(frame));
      }
      controller.close();
    },
  });
}

async function collect(iter: AsyncIterable<AiFrame>): Promise<string> {
  let buffer = "";
  for await (const frame of iter) {
    if (frame.type === "chunk") buffer += frame.text;
  }
  return buffer;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("openai-compat AI client", () => {
  it("throws when endpoint is missing", () => {
    expect(() =>
      createOpenAiCompatClient({ endpoint: "", apiKey: "", chatModel: "llama3", summarizeModel: "llama3" }),
    ).toThrow(AiMisconfiguredError);
  });

  it("translates OpenAI SSE delta frames into the normalized envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          sseBody([
            `data: ${JSON.stringify({ choices: [{ delta: { content: "Hello" } }] })}\n\n`,
            `data: ${JSON.stringify({ choices: [{ delta: { content: " world" } }] })}\n\n`,
            "data: [DONE]\n\n",
          ]),
          { status: 200, headers: { "content-type": "text/event-stream" } },
        );
      }),
    );

    const client = createOpenAiCompatClient({
      endpoint: "http://127.0.0.1:11434/v1",
      apiKey: "",
      chatModel: "llama3",
      summarizeModel: "llama3",
    });
    const stream = await client.chat([{ role: "user", content: "hi" }]);
    await expect(collect(stream)).resolves.toBe("Hello world");
  });

  it("returns the summary text from a non-streamed chat completion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify({ choices: [{ message: { content: "Summary body." } }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const client = createOpenAiCompatClient({
      endpoint: "http://127.0.0.1:11434/v1",
      apiKey: "",
      chatModel: "llama3",
      summarizeModel: "llama3",
    });
    await expect(client.summarize("long text body")).resolves.toEqual({ summary: "Summary body." });
  });

  it("ignores delta.reasoning_content frames from reasoning-enabled servers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          sseBody([
            `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "Let me think." } }] })}\n\n`,
            `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: " Drafting…" } }] })}\n\n`,
            `data: ${JSON.stringify({ choices: [{ delta: { content: "Answer." } }] })}\n\n`,
            "data: [DONE]\n\n",
          ]),
          { status: 200, headers: { "content-type": "text/event-stream" } },
        );
      }),
    );

    const client = createOpenAiCompatClient({
      endpoint: "http://127.0.0.1:11434/v1",
      apiKey: "",
      chatModel: "gemma-reasoning",
      summarizeModel: "gemma-reasoning",
    });
    const stream = await client.chat([{ role: "user", content: "hi" }]);
    await expect(collect(stream)).resolves.toBe("Answer.");
  });

  it("returns only message.content when summarize response also carries reasoning_content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "Three-sentence summary.",
                  reasoning_content: "Thinking Process: 1. Analyze… 2. Draft…",
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const client = createOpenAiCompatClient({
      endpoint: "http://127.0.0.1:11434/v1",
      apiKey: "",
      chatModel: "gemma-reasoning",
      summarizeModel: "gemma-reasoning",
    });
    await expect(client.summarize("doc")).resolves.toEqual({ summary: "Three-sentence summary." });
  });

  it("defaults max_tokens high enough to fit reasoning plus answer", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        capturedBody = JSON.parse(String(init.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ choices: [{ message: { content: "ok." } }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const client = createOpenAiCompatClient({
      endpoint: "http://127.0.0.1:11434/v1",
      apiKey: "",
      chatModel: "gemma-reasoning",
      summarizeModel: "gemma-reasoning",
    });
    await client.summarize("doc");
    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.max_tokens).toBeGreaterThanOrEqual(512);
  });
});
