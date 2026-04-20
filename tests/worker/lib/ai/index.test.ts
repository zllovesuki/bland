import { describe, expect, it } from "vitest";
import { createAiClient, AiMisconfiguredError } from "@/worker/lib/ai";

function baseEnv(overrides?: Partial<Env>): Env {
  return {
    BLAND_AI_MODE: "",
    BLAND_AI_OPENAI_ENDPOINT: "",
    BLAND_AI_OPENAI_API_KEY: "",
    BLAND_AI_OPENAI_CHAT_MODEL: "",
    BLAND_AI_OPENAI_SUMMARIZE_MODEL: "",
    AI: {} as Ai,
    ...overrides,
  } as Env;
}

describe("createAiClient mode selection", () => {
  it("returns mock client when mode is mock", () => {
    const client = createAiClient(baseEnv({ BLAND_AI_MODE: "mock" }));
    expect(typeof client.chat).toBe("function");
    expect(typeof client.summarize).toBe("function");
  });

  it("defaults to workers-ai when mode is empty", () => {
    const client = createAiClient(baseEnv());
    expect(typeof client.chat).toBe("function");
  });

  it("returns openai-compat client when endpoint is configured", () => {
    const client = createAiClient(
      baseEnv({
        BLAND_AI_MODE: "openai-compat",
        BLAND_AI_OPENAI_ENDPOINT: "http://127.0.0.1:1234/v1",
        BLAND_AI_OPENAI_CHAT_MODEL: "llama3",
      }),
    );
    expect(typeof client.chat).toBe("function");
  });

  it("throws a misconfiguration error when openai-compat is selected without an endpoint", () => {
    expect(() => createAiClient(baseEnv({ BLAND_AI_MODE: "openai-compat" }))).toThrow(AiMisconfiguredError);
  });

  it("throws on unknown mode", () => {
    expect(() => createAiClient(baseEnv({ BLAND_AI_MODE: "hypothetical" }))).toThrow(AiMisconfiguredError);
  });
});
