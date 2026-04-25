import { fileURLToPath, URL } from "node:url";
import { defineConfig, defineProject } from "vitest/config";

import { cloudflareWorkerPlugin } from "./tests/vitest/cloudflare";

const srcDirectory = fileURLToPath(new URL("./src", import.meta.url));
const testsDirectory = fileURLToPath(new URL("./tests", import.meta.url));

const aliases = {
  "@": srcDirectory,
  "@tests": testsDirectory,
};

export default defineConfig(() => {
  return {
    test: {
      projects: [
        defineProject({
          resolve: { alias: aliases },
          test: {
            name: "shared",
            include: ["tests/shared/**/*.test.ts"],
          },
        }),
        defineProject({
          resolve: { alias: aliases },
          test: {
            name: "client",
            include: ["tests/client/**/*.test.ts", "tests/client/**/*.test.tsx"],
            exclude: ["tests/client/**/*.dom.test.ts", "tests/client/**/*.dom.test.tsx"],
          },
        }),
        defineProject({
          resolve: { alias: aliases },
          test: {
            name: "client-dom",
            include: ["tests/client/**/*.dom.test.ts", "tests/client/**/*.dom.test.tsx"],
            environment: "jsdom",
            environmentOptions: { jsdom: { url: "http://127.0.0.1/" } },
          },
        }),
        defineProject({
          resolve: { alias: aliases },
          test: {
            name: "worker-unit",
            include: ["tests/worker/**/*.test.ts"],
            exclude: ["tests/worker/**/*.workers.test.ts"],
          },
        }),
        defineProject({
          plugins: [cloudflareWorkerPlugin()],
          resolve: { alias: aliases },
          test: {
            name: "worker-runtime",
            fileParallelism: false,
            include: ["tests/worker/**/*.workers.test.ts"],
            setupFiles: ["./tests/setup/worker.ts"],
          },
        }),
      ],
    },
  };
});
