import type { AiUsage } from "@/shared/ai";
import type {
  AiChatMessage,
  AiChatOptions,
  AiClient,
  AiFrame,
  AiSummarizeOptions,
  AiSummarizeResult,
} from "@/worker/lib/ai/types";

const MOCK_CHAT_PREFIX = "[mock-chat] ";
const MOCK_SUMMARY_PREFIX = "[mock-summary] ";
const MOCK_USAGE: AiUsage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };

export function createMockAiClient(): AiClient {
  return {
    async chat(messages: AiChatMessage[], _opts?: AiChatOptions): Promise<AsyncIterable<AiFrame>> {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const source = lastUser ? lastUser.content : messages.map((m) => m.content).join(" ");
      const body = MOCK_CHAT_PREFIX + source.replace(/\s+/g, " ").trim().slice(0, 120);
      const tokens = splitIntoTokens(body);

      return (async function* (): AsyncGenerator<AiFrame> {
        for (const token of tokens) {
          yield { type: "chunk", text: token };
        }
        yield { type: "usage", usage: MOCK_USAGE };
      })();
    },

    async summarize(text: string, _opts?: AiSummarizeOptions): Promise<AiSummarizeResult> {
      const condensed = text.replace(/\s+/g, " ").trim().slice(0, 160);
      return { summary: MOCK_SUMMARY_PREFIX + condensed, usage: MOCK_USAGE };
    },
  };
}

function splitIntoTokens(text: string): string[] {
  const matches = text.match(/\S+\s*/g);
  return matches ?? [text];
}
