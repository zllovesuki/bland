import { fileURLToPath, URL } from "node:url";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig, defineProject } from "vitest/config";

const srcDirectory = fileURLToPath(new URL("./src", import.meta.url));
const testsDirectory = fileURLToPath(new URL("./tests", import.meta.url));

const aliases = {
  "@": srcDirectory,
  "@tests": testsDirectory,
};

const SHARED_INCLUDE = [
  "tests/shared/**/*.test.ts",
  "tests/worker/lib/ai/**/*.test.ts",
  "tests/worker/lib/auth-cookie.test.ts",
  "tests/worker/lib/http-entry.test.ts",
  "tests/worker/lib/origins.worker.test.ts",
  "tests/worker/lib/security-headers.test.ts",
  "tests/worker/lib/yjs-text.test.ts",
];

const WORKER_INCLUDE = [
  "tests/worker/routes/**/*.test.ts",
  "tests/worker/lib/permission.worker.test.ts",
  "tests/worker/lib/page-tree.worker.test.ts",
  "tests/worker/lib/spa-shell.test.ts",
];

const CLIENT_INCLUDE = ["tests/client/**/*.test.ts", "tests/client/**/*.test.tsx"];

export default defineConfig(() => {
  return {
    test: {
      projects: [
        defineProject({
          resolve: { alias: aliases },
          test: {
            name: "shared",
            include: SHARED_INCLUDE,
          },
        }),
        defineProject({
          resolve: { alias: aliases },
          test: {
            name: "client",
            include: CLIENT_INCLUDE,
          },
        }),
        defineProject({
          plugins: [
            cloudflareTest({
              main: "./src/worker/index.ts",
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
                  BLAND_AI_MODE: "mock",
                  BLAND_AI_OPENAI_ENDPOINT: "",
                  BLAND_AI_OPENAI_API_KEY: "",
                  BLAND_AI_OPENAI_CHAT_MODEL: "",
                  BLAND_AI_OPENAI_SUMMARIZE_MODEL: "",
                  BLAND_AI_WORKERS_CHAT_MODEL: "",
                  BLAND_AI_WORKERS_SUMMARIZE_MODEL: "",
                },
              },
            }),
          ],
          resolve: { alias: aliases },
          test: {
            name: "worker",
            fileParallelism: false,
            include: WORKER_INCLUDE,
            setupFiles: ["./tests/setup/worker.ts"],
          },
        }),
      ],
    },
  };
});
