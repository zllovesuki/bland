import { defineConfig, devices } from "@playwright/test";

const runParallel = process.env.BLAND_E2E_PARALLEL === "1";
const requestedWorkers = Number.parseInt(process.env.BLAND_E2E_WORKERS ?? "", 10);
const parallelWorkers = Number.isFinite(requestedWorkers) && requestedWorkers > 0 ? requestedWorkers : 4;

export default defineConfig({
  testDir: "./specs",
  globalSetup: "./global-setup.ts",
  fullyParallel: runParallel,
  workers: runParallel ? parallelWorkers : 1,
  retries: 0,
  timeout: 60_000,
  globalTimeout: 600_000,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: process.env.BLAND_E2E_BASE_URL,
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 720 },
    colorScheme: "dark",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
