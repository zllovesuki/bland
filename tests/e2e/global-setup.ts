import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  applyMigrations,
  seedTestUser,
  startDevServer,
  stopDevServer,
  closeContextLogs,
  printFailureContext,
  printLogTails,
  type E2eContext,
  type E2eContextFile,
} from "./harness";

export type { E2eContextFile } from "./harness";
export const E2E_CONTEXT_PATH_ENV = "BLAND_E2E_CONTEXT_PATH";

export default async function globalSetup(): Promise<() => Promise<void>> {
  const tempDir = await mkdtemp(join(tmpdir(), "bland-e2e-"));
  console.log(`[e2e] temp state: ${tempDir}`);

  await applyMigrations(tempDir);
  await seedTestUser(tempDir);
  const ctx = await startDevServer(tempDir);

  const contextFile: E2eContextFile = {
    baseUrl: ctx.baseUrl,
    tempDir,
  };

  const contextPath = join(tempDir, ".e2e-context.json");
  await writeFile(contextPath, JSON.stringify(contextFile));

  process.env.BLAND_E2E_BASE_URL = ctx.baseUrl;
  process.env[E2E_CONTEXT_PATH_ENV] = contextPath;

  return async () => {
    await teardown(ctx, tempDir);
  };
}

async function teardown(ctx: E2eContext, tempDir: string): Promise<void> {
  await stopDevServer(ctx.serverProcess);
  await closeContextLogs(ctx);

  if (process.env.BLAND_E2E_PRESERVE === "1") {
    printFailureContext(ctx);
    await printLogTails(ctx);
    console.log(`[e2e] temp state preserved: ${tempDir}`);
  } else {
    await rm(ctx.devVarsPath, { force: true });
    await rm(tempDir, { recursive: true, force: true });
    console.log(`[e2e] temp state cleaned up`);
  }
}
