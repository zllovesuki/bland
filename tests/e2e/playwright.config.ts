import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./specs",
  globalSetup: "./global-setup.ts",
  fullyParallel: false,
  workers: 1,
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
