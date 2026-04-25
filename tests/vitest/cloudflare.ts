import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

const TEST_AI_MODE: string = "mock";

export function cloudflareWorkerPlugin() {
  return cloudflareTest({
    main: "./src/worker/index.ts",
    remoteBindings: TEST_AI_MODE === "workers-ai",
    wrangler: { configPath: "./wrangler.jsonc" },
    miniflare: {
      compatibilityDate: "2026-03-01",
      assets: {
        directory: "./tests/assets",
      },
      bindings: {
        LOG_LEVEL: "warn",
        ALLOWED_ORIGINS: "http://127.0.0.1,http://localhost,https://bland.test",
        JWT_SECRET: "test-jwt-secret-deterministic-value",
        TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
        TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
        SENTRY_DSN: "",
        BLAND_AI_MODE: TEST_AI_MODE,
        BLAND_AI_OPENAI_ENDPOINT: "",
        BLAND_AI_OPENAI_API_KEY: "",
        BLAND_AI_OPENAI_CHAT_MODEL: "",
        BLAND_AI_OPENAI_SUMMARIZE_MODEL: "",
        BLAND_AI_WORKERS_CHAT_MODEL: "",
        BLAND_AI_WORKERS_SUMMARIZE_MODEL: "",
      },
    },
  });
}
